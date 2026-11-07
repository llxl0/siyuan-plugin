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

/**
 * Kernel transaction shapes — these mirror the Go structs' **json tags**, which
 * are lowerCamelCase (`doOperations`, `action`, `id`, `rootID`). Reading them as
 * capitalized `DoOperations`/`Action` yields undefined and silently drops every
 * event — that bug is why AI-authored writes never triggered a push.
 */
type TxnOperation = {
        action?: string;
        id?: string;
        rootID?: string;
};

/** One kernel transaction: a batch of block-level operations. */
type TxnItem = {
        doOperations?: TxnOperation[];
        DoOperations?: TxnOperation[]; // tolerated: older/manual payloads
};

type TxnPayload = {
        cmd?: string;
        data?: TxnItem[] | { transactions?: TxnItem[] };
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
        /** When the current `busy` window started (stale-lock detection). */
        private busySince = 0;
        private lastKnownRemoteSha: string | null = null;
        /** Set when a push was requested while another op held `busy`. */
        private pendingPush = false;
        private wsHandler: (event: CustomEvent) => void;

        constructor(
                plugin: Plugin,
                engine: SyncEngine,
                api: GitHubAPI,
                siyuan: SiYuanAPI,
                ledger: SyncStateLedger,
                config: GitPluginConfig,
                private statusBar?: {
                setBusy(b: boolean): void;
                markSynced(): void;
                setCounts(local: number | null, remote: number | null): void;
        },
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
                void this.reportCounts();
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
                // IMPORTANT: kernel sets `evt.Data = transactions` (a bare array).
                // There is no `{transactions: [...]}` wrapper — reading it as an
                // object silently produced an empty list and dropped every push.
                const dat: unknown = data.data;
                const txns: TxnItem[] = Array.isArray(dat)
                        ? (dat as TxnItem[])
                        : ((dat as { transactions?: TxnItem[] })?.transactions ?? []);
                this.trace(`txn recv=${txns.length}`);
                const MUTATING = /^(update|insert|delete|move|append|prepend|fold|unfold)/i;
                const relevant = txns.some((t) => {
                        const ops = t.doOperations ?? t.DoOperations ?? [];
                        return ops.some(
                                (op) =>
                                        !!op.id ||
                                        !!op.rootID ||
                                        MUTATING.test(op.action ?? ""),
                        );
                });
                this.trace(`txn relevant=${relevant}`);
                if (!relevant) return;

                if (this.pushTimer) clearTimeout(this.pushTimer);
                this.pushTimer = setTimeout(() => this.firePush(), DEBOUNCE_MS);
        }

        private async firePush(): Promise<void> {
                // Don't drop the event when another op is running — remember it and
                // replay once the current op finishes (a dropped event = lost sync).
                if (this.busy) {
                        this.pendingPush = true;
                        this.trace("push deferred (busy)");
                        return;
                }
                this.busy = true;
                this.pendingPush = false;
                this.busySince = Date.now();
                this.statusBar?.setBusy(true);
                try {
                        const r = await this.engine.pushToGitHub();
                        if (r.status === "success") {
                                this.lastKnownRemoteSha = null;
                                this.statusBar?.markSynced();
                                void this.reportCounts();
                        }
                } catch (e) {
                        const raw = e instanceof Error ? `${e.message}` : String(e);
                        this.trace(`push error: ${raw}`);
                } finally {
                        this.busy = false;
                        // Replay a push that was requested while we were busy.
                        if (this.pendingPush) {
                                this.pendingPush = false;
                                this.trace("push replay after busy");
                                setTimeout(() => this.firePush(), 500);
                        }
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
                this.busySince = Date.now();
                this.statusBar?.setBusy(true);
                try {
                        // Generous ceiling: the very first pull may transfer 600+ files.
                        // At 16-way parallel (measured 102ms/file) that is ≈63s; keep a
                        // wide margin so a cold start never trips the timeout.
                        const r = (await Promise.race([
                                this.engine.pullFromGitHub(),
                                new Promise<never>((_, rej) =>
                                        setTimeout(() => rej(new Error("pull timeout 300s")), 300000),
                                ),
                        ])) as Awaited<ReturnType<SyncEngine["pullFromGitHub"]>>;
                        if (r.status === "success") {
                                this.trace("pulled -> " + remoteSha.slice(0, 7));
                                this.statusBar?.markSynced();
                                void this.reportCounts();
                        }
                        else
                                this.trace("pull not-success: " + JSON.stringify(r).slice(0, 200));
                } catch (e) {
                        const raw =
                                (e as { rawMessage?: string })?.rawMessage ??
                                (e instanceof Error ? e.message : String(e));
                        this.trace(`pull error: ${raw}`);
                } finally {
                        this.busy = false;
                        this.busySince = 0;
                        if (this.pendingPush) {
                                this.pendingPush = false;
                                this.trace("push replay after pull");
                                setTimeout(() => this.firePush(), 300);
                        }
                }
        }
// ---------- watchdog ----------

        private startWatchdog(): void {
                if (this.watchdog) clearInterval(this.watchdog);
                this.watchdog = setInterval(async () => {
                        try {
                                // Stuck pipeline recovery: a stalled kernel-relay request
                                // never settles, so SyncEngine's activeTask lock would
                                // block all later pushes/pulls forever.
                                const lockAge = this.engine.lockAgeMs();
                                if (lockAge > 330000) {  // > pull 上限 300s+余量
                                        this.trace(`watchdog: engine lock stale ${lockAge}ms`);
                                        this.engine.forceReleaseLock("watchdog timeout");
                                        this.busy = false;
                                        this.busySince = 0;
                                        if (this.pendingPush) {
                                                this.pendingPush = false;
                                                this.trace("watchdog: replay pending push");
                                                setTimeout(() => this.firePush(), 500);
                                        }
                                }
                                // Stale-lock recovery for our own flag.
                                if (this.busy && this.busySince && Date.now() - this.busySince > 120000) {
                                        this.trace("watchdog: clearing stale busy lock");
                                        this.busy = false;
                                        this.busySince = 0;
                                }
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
                        } catch (e) {
                                this.trace("watchdog error: " + e);
                        }
                }, WATCHDOG_MS);
        }

        /** Report local/remote file counts to the status bar (best effort).
         *  Both sides must use the SAME accounting, otherwise static files
         *  (plugin binaries, ignored storage) show up as phantom diffs:
         *  - remote: only data/ blobs, excluding ignored prefixes
         *  - local : ledger tracks exactly the same set (engine's sync scope) */
        private async reportCounts(): Promise<void> {
                if (!this.statusBar) return;
                try {
                        const base = `/repos/${this.config.username}/${this.config.repo}`;
                        const refRes = await this.api.gh(`${base}/git/refs/heads/main`);
                        const refJson = (await refRes.json()) as { object?: { sha?: string } };
                        const sha = refJson.object?.sha;
                        if (!sha) return;
                        const cRes = await this.api.gh(`${base}/git/commits/${sha}`);
                        const cJson = (await cRes.json()) as { tree?: { sha?: string } };
                        const treeSha = cJson.tree?.sha;
                        if (!treeSha) return;
                        const tRes = await this.api.gh(`${base}/git/trees/${treeSha}?recursive=1`);
                        const tJson = (await tRes.json()) as {
                                tree?: { type: string; path: string }[];
                        };
                        // Same skip rules as the engine (SKIP_ROOT_DIRS):
                        // plugins/conf/.siyuan/storage/emojis/public/templates/
                        // widgets/history are engine-wide excluded from sync.
                        const IGNORED = /^data\/(plugins|conf|\.siyuan|storage|emojis|public|templates|widgets|history)\//;
                        const remote = (tJson.tree ?? []).filter(
                                (x) => x.type === "blob" && x.path.startsWith("data/") && !IGNORED.test(x.path),
                        ).length;
                        const local = Object.keys(this.ledger.getState()).filter(
                                (p) => !IGNORED.test(p),
                        ).length;
                        this.statusBar.setCounts(local, remote);
                } catch {
                        /* status bar is cosmetic; never let it break sync */
                }
        }

        // ---------- trace ----------

        private traceChain: Promise<void> = Promise.resolve();

        /** Serialized append-only trace (concurrent calls would otherwise
         *  read-modify-write the same file and lose lines). */
        private trace(msg: string): Promise<void> {
                this.traceChain = this.traceChain.then(() => this.traceOnce(msg));
                return this.traceChain;
        }

        private async traceOnce(msg: string): Promise<void> {
                try {
                        const line = `${new Date().toISOString()} ${msg}\n`;
                        let prev = "";
                        try {
                                const r = await fetch("/api/file/getFile", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ path: TRACE_PATH }),
                                });
                                if (r.ok) {
                                        prev = await r.text();
                                        if (prev.length > 16384) prev = "";
                                }
                        } catch {
                                /* file absent on first write */
                        }
                        const fd = new FormData();
                        fd.append("path", TRACE_PATH);
                        fd.append("isDir", "false");
                        fd.append("modTime", Date.now().toString());
                        fd.append("file", new Blob([prev + line]));
                        await fetch("/api/file/putFile", { method: "POST", body: fd });
                } catch {
                        /* tracing must never break sync */
                }
        }
}