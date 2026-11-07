/**
 * Realtime sync engine — Notion-style push/pull for the GitHub Sync plugin.
 *
 * Design (ported from the battle-tested patches on GIT-SYNC-PLUGIN, 2026-11-07):
 *
 * 1. Event-driven push   : listens to SiYuan's ws-main transaction events,
 *                          debounces 2s, then increments the sync (push) .
 * 2. ETag fast poll      : polls `GET /repos/{o}/{r}/git/refs/heads/{branch}`
 *                          every POLL_MS with If-None-Match; a 304 response does
 *                          NOT count against the API rate limit. On change ->
 *                          pullFromGitHub() (which itself only transfers diffs).
 * 3. Watchdog            : SiYuan does not re-fire onLayoutReady after a plugin
 *                          reload, so timers can silently die. A 15s watchdog
 *                          re-arms both timers when missing.
 * 4. Quiet trace         : only anomaly events are written to temp/gs_realtime.log
 *                          (fixed file, overwritten - no growth).
 */

import { Plugin } from "siyuan";

import { GitHubAPI } from "../api/Github-api";
import { SiYuanAPI } from "../api/Siyuan-api";
import { SyncEngine } from "./SyncEngine";
import { SyncStateLedger } from "./SyncStateLedger";
import { GitPluginConfig } from "../shared-utils/types";

const DEBOUNCE_MS = 2000; // wait for user to stop typing
const POLL_MS = 10000; // ETag poll interval (304s are free)
const WATCHDOG_MS = 15000; // re-arm interval
const TRACE_PATH = "temp/gs_realtime.log";

type TxnOperation = {
        Action?: string;
        RootID?: string;
};

type TxnPayload = {
        cmd?: string;
        data?: {
                transactions?: {
                        DoOperations?: TxnOperation[];
                }[];
        };
};

export class RealtimeEngine {
        private plugin: Plugin;
        private engine: SyncEngine;
        private api: GitHubAPI;
        private siyuan: SiYuanAPI;
        private ledger: SyncStateLedger;
        private config: GitPluginConfig;

        private pushTimer: ReturnType<typeof setTimeout> | null = null;
        private pollTimer: ReturnType<typeof setInterval> | null = null;
        private watchdog: ReturnType<typeof setInterval> | null = null;
        private etag: string | null = null;
        private busy = false;
        private lastKnownRemoteSha: string | null = null;
        private sinceLastPush = 0;
        private wsHandler: (event: CustomEvent) => void;

        constructor(
                plugin: Plugin,
                engine: SyncEngine,
                api: GitHubAPI,
                siyuan: SiYuanAPI,
                ledger: SyncStateLedger,
                config: GitPluginConfig,
        ) {
                this.plugin = plugin;
                this.engine = engine;
                this.api = api;
                this.siyuan = siyuan;
                this.ledger = ledger;
                this.config = config;

                this.wsHandler = (data) => this.onWsMain(data);
        }

        /** Called once from onload(). Safe to call again (idempotent). */
        public start(): void {
                this.stop();
                this.installEventHook();
                this.startPoll();
                this.startWatchdog();
                this.trace("realtime start poll=" + POLL_MS);
        }

        public stop(): void {
                try {
                        this.plugin.eventBus.off("ws-main", this.wsHandler);
                } catch {
                        /* not registered yet */
                }
                if (this.pushTimer) clearTimeout(this.pushTimer);
                if (this.pollTimer) clearInterval(this.pollTimer);
                if (this.watchdog) clearInterval(this.watchdog);
                this.pushTimer = this.pollTimer = this.watchdog = null;
        }

        // ---------- 1. event-driven push ----------

        private installEventHook(): void {
                try {
                        this.plugin.eventBus.on("ws-main", this.wsHandler);
                } catch (e) {
                        this.trace("eventBus hook failed: " + e);
                }
        }

        private onWsMain(event: CustomEvent): void {
                const data = event.detail as TxnPayload | undefined;
                // Kernel broadcasts every editor transaction with cmd "transactions"
                if (data?.cmd !== "transactions") return;
                const txns = data.data?.transactions ?? [];
                const relevant = txns.some((t) =>
                        (t.DoOperations ?? []).some((op) => !!op.RootID),
                );
                if (!relevant) return;

                if (this.pushTimer) clearTimeout(this.pushTimer);
                this.pushTimer = setTimeout(() => this.firePush(), DEBOUNCE_MS);
        }

        private async firePush(): Promise<void> {
                if (this.busy) return;
                this.busy = true;
                this.sinceLastPush = 0;
                try {
                        const r = await this.engine.pushToGitHub();
                        if (r.status === "success") this.lastKnownRemoteSha = null;
                } catch (e) {
                        this.trace("push error: " + e);
                } finally {
                        this.busy = false;
                }
        }

        // ---------- 2. ETag poll ----------

        private startPoll(): void {
                if (this.pollTimer) clearInterval(this.pollTimer);
                this.pollTimer = setInterval(() => this.pollOnce(), POLL_MS);
        }

        private async pollOnce(): Promise<void> {
                if (this.busy) return;
                try {
                        const owner = this.config.username;
                        const repo = this.config.repo;
                        const branch = "main";
                        const headers: Record<string, string> = {
                                Authorization: `Bearer ${this.config.token}`,
                                Accept: "application/vnd.github+json",
                        };
                        if (this.etag) headers["If-None-Match"] = this.etag;

                        // Mobile: relay the ETag check through the kernel too —
                        // the WebView fetch is the thing that fails on CN networks.
                        const isMobile =
                                typeof document !== "undefined" &&
                                document.body.classList.contains("body--mobile");

                        let res: Response;
                        if (isMobile) {
                                const pr = await fetch("/api/network/forwardProxy", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                                url: `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
                                                method: "GET",
                                                headers: [
                                                        { Authorization: headers["Authorization"] },
                                                        { Accept: headers["Accept"] },
                                                        ...(this.etag
                                                                ? [{ "If-None-Match": this.etag }]
                                                                : []),
                                                ],
                                                timeout: 20000,
                                                contentType: "application/json",
                                        }),
                                });
                                const pj = await pr.json();
                                if (pj.code !== 0) return;
                                const status = pj.data.status as number;
                                if (status === 304) return; // unchanged, free
                                if (status === 404) return; // empty repo, push first
                                if (status !== 200) return;
                                const j = JSON.parse((pj.data.body ?? "{}") as string) as {
                                        object?: { sha?: string };
                                };
                                const remoteSha = j.object?.sha ?? null;
                                await this.maybePull(remoteSha);
                                return;
                        }

                        res = await fetch(
                                `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
                                { headers },
                        );
                        if (res.status === 304) return; // unchanged, free
                        if (res.status === 404) return; // empty repo, push first
                        if (!res.ok) return;
                        this.etag = res.headers.get("ETag") ?? null;

                        const j = (await res.json()) as {
                                object?: { sha?: string };
                        };
                        const remoteSha = j.object?.sha ?? null;
                        await this.maybePull(remoteSha);
                } catch (e) {
                        // network hiccup - silent, next tick retries
                }
        }

        /** Shared tail of pollOnce: pull only when remoteSha differs from the
         *  locally known head (avoids re-pulling our own pushes). */
        private async maybePull(remoteSha: string | null): Promise<void> {
                if (!remoteSha || remoteSha === this.lastKnownRemoteSha) return;

                const localSha = this.ledger.getHead();
                this.lastKnownRemoteSha = remoteSha;
                if (localSha && localSha === remoteSha) return; // our own push

                // New remote commit -> incremental pull
                this.busy = true;
                try {
                        const r = await this.engine.pullFromGitHub();
                        if (r.status === "success")
                                this.trace("pulled -> " + remoteSha.slice(0, 7));
                        else
                                this.trace("pull not-success: " + JSON.stringify(r).slice(0, 300));
                } catch (e) {
                        // keep the RAW message — friendlyError() masks root causes
                        const raw =
                                (e as { rawMessage?: string })?.rawMessage ??
                                (e instanceof Error ? e.message : String(e));
                        const stack = e instanceof Error && e.stack ? e.stack.split("\n")[1] : "";
                        this.trace(`pull error: ${raw} ${stack}`);
                } finally {
                        this.busy = false;
                }
        }
// ---------- watchdog ----------

        private startWatchdog(): void {
                if (this.watchdog) clearInterval(this.watchdog);
                this.watchdog = setInterval(async () => {
                        try {
                                if (!this.pollTimer) {
                                        this.trace("watchdog: respawn poll");
                                        this.startPoll();
                                }
                                // re-arm the ws-main hook if it was dropped (plugin reload)
                                try {
                                        this.plugin.eventBus.off("ws-main", this.wsHandler);
                                        this.plugin.eventBus.on("ws-main", this.wsHandler);
                                } catch {
                                        this.trace("watchdog: hook reinstall failed");
                                }
                                // Safety net: if a kernel-API write bypassed the
                                // frontend (no ws-main broadcast), the local tree
                                // may hold unsynced changes. Detect cheaply by
                                // comparing our ledger head with the remote head;
                                // if they match but SiYuan auto-stat shows drift,
                                // fall back to a periodic push every 5 minutes.
                                this.sinceLastPush += WATCHDOG_MS;
                                if (this.sinceLastPush >= 300000) {
                                        this.sinceLastPush = 0;
                                        this.trace("watchdog: periodic push safety net");
                                        await this.firePush();
                                }
                        } catch (e) {
                                this.trace("watchdog error: " + e);
                        }
                }, WATCHDOG_MS);
        }

        // ---------- trace ----------

        private async trace(msg: string): Promise<void> {
                try {
                        const line = `${new Date().toISOString()} ${msg}\n`;
                        const fd = new FormData();
                        fd.append("path", TRACE_PATH);
                        fd.append("isDir", "false");
                        fd.append("modTime", Date.now().toString());
                        fd.append("file", new Blob([line]));
                        await fetch("/api/file/putFile", { method: "POST", body: fd });
                } catch {
                        /* tracing must never break sync */
                }
        }
}