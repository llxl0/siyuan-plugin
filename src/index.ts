/**
 * Main plugin entry point.
 * Initializes configurations, UI components (SettingsUI, StatusBarUI),
 * internal state (SyncStateLedger), and the backend orchestrator (SyncEngine),
 * wiring them directly to SiYuan top-bar commands.
 *
 * 2026-11-07 (llxl0 fork): added RealtimeEngine — event-driven push +
 * ETag-based fast pull poll + watchdog, turning this into Notion-style sync.
 */

import { Plugin, showMessage } from "siyuan";

import { SyncEngine } from "./engine/SyncEngine";
import { SyncStateLedger } from "./engine/SyncStateLedger";
import { CryptoModule } from "./engine/CryptoModule";
import { RealtimeEngine } from "./engine/RealtimeEngine";
import { MdMirror } from "./engine/MdMirror";

import { GitHubAPI } from "./api/Github-api";
import { SiYuanAPI } from "./api/Siyuan-api";

import { SettingsUI } from "./ui/SettingsUI";
import { StatusBarUI } from "./ui/statusBarUI";

import { t, setLocale, getLocale } from "./shared-utils/i18n";
import {
        STORAGE_KEY,
        DEFAULT_CONFIG,
        GitPluginConfig,
        SyncError,
} from "./shared-utils/types";
import { friendlyError } from "./shared-utils/utils";

/** [rt46] Version stamped by the release script (keep in sync with plugin.json). */
const SELF_VERSION = "4.0.4-rt68";

export default class GitHubSyncPlugin extends Plugin {
        private engine!: SyncEngine;
        private ui!: SettingsUI;
        private ledger!: SyncStateLedger;
        private statusBar!: StatusBarUI;
        private realtime!: RealtimeEngine;
        private mdMirror?: MdMirror;
        /** True while a user-initiated (button) sync runs — gates the progress dialog. */
        public isManualSync = false;
        public config: GitPluginConfig = { ...DEFAULT_CONFIG };

        async onload() {
                const saved = await this.loadData(STORAGE_KEY);
                if (saved) {
                        this.config = { ...DEFAULT_CONFIG, ...saved };
                }

                try {
                        setLocale(this.config.language ?? "en");
                        (window as Window).__github_sync_locale = getLocale();
                } catch (e) {
                        console.error(
                                `[GitHub Sync] Failed to load locale '${this.config.language}'`,
                                e,
                        );
                }

                const siyuan = new SiYuanAPI();
                const api = new GitHubAPI(this.config);
                const crypto = new CryptoModule(this.config);
                this.ledger = new SyncStateLedger(this);
                this.engine = new SyncEngine(api, crypto, this.ledger, this.config, siyuan);

                this.ui = new SettingsUI(this, this.engine);
                this.ui.registerSettings();

                this.statusBar = new StatusBarUI(this, this.config);
                setTimeout(() => {
                        this.statusBar.attach();
				// [rt68] stamp id on our state button (addTopBar lacks id param)
				const locateStateBtn = () => {
					const found = [...document.querySelectorAll("#toolbar .toolbar__item")]
						.find((e) => (e.getAttribute("title") || "").indexOf("同步状态") >= 0);
					if (found) found.id = "rt-sync-state";
					return !!found;
				};
				const locateTimer = setInterval(() => { if (locateStateBtn()) clearInterval(locateTimer); }, 500);
                        // [rt55] spin keyframes (once)
                        if (!document.getElementById("rt-spin-style")) {
                                const st = document.createElement("style");
                                st.id = "rt-spin-style";
                                st.textContent = "@keyframes rt-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}";
                                document.head.appendChild(st);
                        }
                        this.statusBar.startTicker();
                }, 1000);

                this.addTopBar({
                        id: "rt-sync-state",
                        icon: "iconRefresh",
                        title: "同步状态（点击查看详情）",
                        position: "right",
                        callback: async () => {
                                this.showSyncDetail();
                                // [rt55] push happens in background via realtime engine;
                                // the icon shows the state (spin/idle/error)
                        },
                });
		// [rt43] sync-mode badges on the doc tree (2s light calibration)
		setInterval(() => this.markSyncModeBadges(), 2000);
		// [rt59] state icon auto-refresh (2s, cheap)
		setInterval(() => this.refreshStateIcon(), 2000);
        // [rt50] feed notebook list to status bar for mode breakdown
        fetch("/api/notebook/lsNotebooks", { method: "POST", body: "{}" })
            .then((r) => r.json())
            .then((j) => { this.statusBar.notebookList = j?.data?.notebooks || []; })
            .catch(() => {});

		// [rt51] per-notebook doc counts (status bar lan/off display)
		const refreshNbDocCounts = () => {
			fetch("/api/query/sql", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ stmt: `SELECT box, COUNT(*) AS c FROM blocks WHERE type="d" GROUP BY box` }),
			})
			.then((r) => r.json())
			.then((j) => {
				const map: Record<string, number> = {};
				for (const row of j?.data || []) map[row.box] = row.c;
				this.statusBar.nbDocCounts = map;
				this.statusBar.refresh();
			})
			.catch(() => {});
		};
		refreshNbDocCounts();
		setInterval(refreshNbDocCounts, 60000);

		// [rt52] LAN peer doc counts for lan-mode notebooks
		const refreshLanPeerCounts = () => {
			const peers = this.config.lanPeers || [];
			if (peers.length === 0) return;
			const token = this.config.token || "";
			const overrides = this.config.nbSyncModes || {};
			const lanBoxes = Object.keys(overrides)
				.filter((b) => overrides[b] === "lan");
			const [host, port] = peers[0].split(":");
			const base = `http://${host}:${port || 6806}`;
			fetch(base + "/api/query/sql", {
				method: "POST",
				headers: { "Content-Type": "application/json",
					Authorization: "Token " + token },
				body: JSON.stringify({ stmt: `SELECT box, COUNT(*) AS c FROM blocks WHERE type="d" GROUP BY box` }),
			})
			.then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
			.then((j) => {
				const map: Record<string, number> = {};
				for (const row of j?.data || []) map[row.box] = row.c;
				const out: Record<string, number | null> = {};
				for (const b of lanBoxes) out[b] = map[b] ?? 0;
				this.statusBar.nbPeerCounts = out;
				this.statusBar.refresh();
			})
			.catch(() => {
				const out: Record<string, number | null> = {};
				for (const b of lanBoxes) out[b] = null;
				this.statusBar.nbPeerCounts = out;
				this.statusBar.refresh();
			});
		};
		setInterval(refreshLanPeerCounts, 60000);

                this.addTopBar({
                        icon: "iconGitHubDownload",
                        title: t("top.pull_title"),
                        position: "right",
                        callback: async () => {
                                this.isManualSync = true;
                                if (this.statusBar) { this.statusBar.syncState = "syncing"; this.statusBar.lastAction = "pull"; }
									try {
                                        await this.engine.pullFromGitHub();
                                        await this.statusBar.saveTimestamp();
                                } catch (err) {
                                        const msg =
                                                err instanceof SyncError ? err.message : friendlyError(err);
                                        showMessage(msg, 6000, "error");
                                } finally {
                                        this.isManualSync = false;
                                }
                        },
                });

                // Realtime sync (event push + ETag poll + watchdog)
                this.realtime = new RealtimeEngine(
                        this,
                        this.engine,
                        api,
                        siyuan,
                        this.ledger,
                        this.config,
                        this.statusBar,
                );
                this.realtime.start();

                // [rt32] Optional md-repo mirror (mobile project-docs bridge).
                if (this.config.mdRepo) {
                        this.mdMirror = new MdMirror(
                                this,
                                api,
                                siyuan,
                                this.config,
                        );
                        this.mdMirror.start();
                }
        }

	/** [rt43] Append sync-mode badge to each notebook in the doc tree. */
	/** [rt46] Pull latest build from the rt-stable branch and self-install. */
	public async checkSelfUpdate(): Promise<void> {
		const base = "https://raw.githubusercontent.com/llxl0/siyuan-plugin/rt-stable/dist";
		showMessage("正在检查更新…", 3000);
		try {
			const res = await fetch(base + "/plugin.json", { cache: "no-store" });
			if (!res.ok) throw new Error("plugin.json " + res.status);
			const remote = await res.json();
			const localVer = SELF_VERSION;
			const remoteVer = String(remote.version || "");
			if (!remoteVer || remoteVer === localVer) {
				showMessage(`已是最新版本（${localVer}）`, 4000);
				return;
			}
			// 有新版本：下载两个文件并写入自身目录
			const jsRes = await fetch(base + "/index.js", { cache: "no-store" });
			if (!jsRes.ok) throw new Error("index.js " + jsRes.status);
			const jsBuf = await jsRes.arrayBuffer();
			const meta = { path: "/data/plugins/" + this.name + "/plugin.json" };
			const jsPath = "/data/plugins/" + this.name + "/index.js";
			const fd1 = new FormData();
			fd1.append("path", meta.path); fd1.append("isDir", "false");
			fd1.append("file", new Blob([JSON.stringify(remote)], { type: "application/json" }));
			const fd2 = new FormData();
		fd2.append("path", jsPath); fd2.append("isDir", "false");
			fd2.append("file", new Blob([jsBuf]));
			const r1 = await fetch("/api/file/putFile", { method: "POST", body: fd1 });
			const r2 = await fetch("/api/file/putFile", { method: "POST", body: fd2 });
			if (r1.ok && r2.ok) {
				showMessage(`已更新到 ${remoteVer}，重启思源生效`, 8000, "info");
			} else {
				throw new Error(`putFile ${r1.status}/${r2.status}`);
			}
		} catch (e: any) {
			console.error("[RT] self-update failed", e);
			showMessage("检查更新失败：" + (e?.message || e), 6000, "error");
		}
	}

	private markSyncModeBadges(): void {
		const overrides = this.config.nbSyncModes || {};
		const global = this.config.syncMode || "cloud";
		const icons: Record<string, string> = { cloud: "☁", lan: "🏠", off: "⛔" };
		const roots = document.querySelectorAll(
			'li[data-type="navigation-root"][data-tree-key^="notebook:"]',
		);
		roots.forEach((li) => {
			const key = (li as HTMLElement).dataset.treeKey || "";
			const box = key.slice("notebook:".length);
			const mode = overrides[box] || global;
			const text = li.querySelector(".b3-list-item__text");
			if (!text) return;
			let badge = text.querySelector<HTMLElement>(".rt-sync-badge");
			if (!badge) {
				badge = document.createElement("span");
				badge.className = "rt-sync-badge";
				badge.style.cssText = "margin-left:4px;font-size:11px;opacity:.75;";
				text.appendChild(badge);
			}
			const want = icons[mode] || "";
			if (badge.textContent !== want) badge.textContent = want;
			badge.title = "同步模式: " + mode;
		});
	}

        /** [rt55] Sync detail popover. */
        async showSyncDetail(): Promise<void> {
            const bar = this.statusBar as any;
            const local = bar?.localCount ?? 0;
            const remote = bar?.remoteCount ?? 0;
            const state = bar?.syncState || "idle";
            const stateText = state === "syncing" ? "🔄 正在同步…" : state === "error" ? "⛔ 上次同步失败" : "✅ 已同步";
            let timeLine = "";
            if (this.config.lastSync) {
                const d = new Date(this.config.lastSync);
                const pad = (n: number) => String(n).padStart(2, "0");
                const ts = `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                timeLine = `<div style="margin-top:6px;font-size:12px;opacity:.75">上次云端同步: ${ts}</div>`;
            }
            const rows = (bar?.modeDetail as string) || "（无数据）";
            const el = document.createElement("div");
            el.style.cssText = "position:fixed;top:40px;right:60px;z-index:99;background:var(--b3-theme-background);border:1px solid var(--b3-border-color);border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.25);max-width:380px;max-height:50vh;overflow:auto;padding:12px;font-size:13px;line-height:1.9;user-select:text;";
            el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between"><span style="font-weight:600"><span style="opacity:.75">GitHub</span>: ${local}/${remote} · ${stateText}</span><span id="rt-detail-close" style="cursor:pointer;opacity:.6;padding:0 4px">✕</span></div>${timeLine}<div style="margin-top:8px;font-weight:600">笔记本同步模式</div><div id="rt-nb-rows">加载中…</div>` + `<div style="margin-top:10px;display:flex;gap:8px"><button id="rt-detail-sync" class="b3-button b3-button--outline" style="font-size:12px">手动同步</button></div>`;
            // [rt58] manual sync button (disabled while syncing)
            const syncBtn = el.querySelector("#rt-detail-sync") as HTMLButtonElement;
            syncBtn.onclick = async () => {
				syncBtn.disabled = true;
				syncBtn.textContent = "同步中…";
				if (this.statusBar) this.statusBar.syncState = "syncing";
				this.refreshStateIcon();
				try {
					await this.engine.pullFromGitHub();
					await this.engine.pushToGitHub();
					if (this.statusBar) this.statusBar.syncState = "idle";
					await this.statusBar.saveTimestamp();
					showMessage("手动同步完成", 3000);
				} catch (err) {
					if (this.statusBar) this.statusBar.syncState = "error";
					showMessage("同步失败：" + (err instanceof Error ? err.message : err), 6000, "error");
				} finally {
					syncBtn.disabled = false;
					syncBtn.textContent = "手动同步";
					this.refreshStateIcon();
				}
			};
            const close = () => el.remove();
            el.addEventListener("click", close);
            document.body.appendChild(el);
            // [rt60/64] fetch notebooks + doc counts + peer data (await style)
            try {
                const sqlRes = await fetch("/api/query/sql", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ stmt: `SELECT box, COUNT(*) AS c FROM blocks WHERE type="d" GROUP BY box` }),
                });
                const sqlJson = await sqlRes.json();
                const docMap: Record<string, number> = {};
                for (const row of sqlJson?.data || []) docMap[row.box] = row.c;
                const nbRes = await fetch("/api/notebook/lsNotebooks", { method: "POST", body: "{}" });
                const nbJson = await nbRes.json();
                const nbs = (nbJson?.data?.notebooks || []) as { id: string; name: string }[];
                const overrides = (this.config.nbSyncModes || {}) as Record<string, string>;
                const global = (this.config.syncMode || "cloud") as string;
                const icons: Record<string, string> = { cloud: "\u2601", lan: "\ud83c\udfe0", off: "\u26d4" };
                let html = "";
                for (const nb of nbs) {
                    const mode = overrides[nb.id] || global;
                    const c = docMap[nb.id] ?? 0;
                    html += `<div>${icons[mode] || ""} ${nb.name} — ${mode} · ${c} 篇</div>`;
                }
                const sec = el.querySelector("#rt-nb-rows");
                if (sec) sec.innerHTML = html || "（无笔记本）";
                // peer section
                const peers = (this.config.lanPeers || []) as string[];
                let psec = el.querySelector("#rt-peer-rows") as HTMLElement | null;
                if (!psec) {
                    psec = document.createElement("div");
                    psec.id = "rt-peer-rows";
                    psec.style.cssText = "margin-top:8px";
                    if (sec && sec.parentElement) sec.parentElement.insertBefore(psec, sec.nextSibling);
                }
                if (peers.length === 0) { psec.innerHTML = "未配置 LAN 对端"; }
                else {
                    const [ph, pp] = peers[0].split(":");
                    const pbase = `http://${ph}:${pp || 6806}`;
                    try {
                        const pr = await fetch(pbase + "/api/query/sql", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: "Token " + (this.config.token || "") },
                            body: JSON.stringify({ stmt: `SELECT box, COUNT(*) AS c FROM blocks WHERE type="d" GROUP BY box` }),
                        });
                        if (!pr.ok) throw new Error(String(pr.status));
                        const pj = await pr.json();
                        const pmap: Record<string, number> = {};
                        for (const row of pj?.data || []) pmap[row.box] = row.c;
                        let phtml = `<div style="font-size:12px;opacity:.7">${ph}</div>`;
                        for (const nb of nbs) {
                            const c = docMap[nb.id] ?? 0;
                            const pc = pmap[nb.id] ?? 0;
                            const mark = c === pc ? "\u2705" : "\u26a0\ufe0f";
                            phtml += `<div>${mark} ${nb.name}: 本端 ${c} / 对端 ${pc}</div>`;
                        }
                        psec.innerHTML = phtml;
                    } catch {
                        psec.innerHTML = `对端 ${ph} 不可达`;
                    }
                }
            } catch (e) {
                console.warn("[RT] detail fetch failed", e);
            }
            setTimeout(() => {
                const closer = (ev: MouseEvent) => {
                    if (!el.contains(ev.target as Node)) { close(); document.removeEventListener("click", closer); }
                };
                document.addEventListener("click", closer);
            }, 50);
        }

        /** [rt55] Refresh the combo state/push icon. */
        refreshStateIcon(): void {
            const bar = this.statusBar as any;
            const state = bar?.syncState || "idle";
            const dir = bar?.lastAction || "push";
            const icon = state === "syncing" ? "iconRefresh"
                : dir === "pull" ? "iconGitHubDownload" : "iconGitHubUpload";
            let btn = document.getElementById("rt-sync-state") as HTMLElement;
            if (!btn) {
                btn = [...document.querySelectorAll("#toolbar .toolbar__item")]
                    .find((e) => (e.getAttribute("title") || "").indexOf("同步状态") >= 0) as HTMLElement;
                if (btn) btn.id = "rt-sync-state";
            }
            if (!btn) return;
            const b = btn as HTMLElement;
            b.style.color = state === "error" ? "var(--b3-theme-error)"
                : state === "syncing" ? "var(--b3-theme-warning)" : "";
            b.style.animation = state === "syncing" ? "rt-spin 1s linear infinite" : "";
            b.title = state === "syncing" ? "正在同步…" : state === "error" ? "上次同步失败" : "已同步（点击查看详情）";
            if (state === "idle") {
                if (b.dataset.iconState !== "idle") {
                    b.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" style="fill:currentColor"><rect x="3" y="4" width="10" height="2" rx="1"/><rect x="3" y="10" width="10" height="2" rx="1"/></svg>`;
                    b.dataset.iconState = "idle";
                }
            } else {
                b.innerHTML = `<svg style="width:14px;height:14px"><use xlink:href="#" + icon + "></use></svg>`;
                b.dataset.iconState = state;
            }
        }


        async onunload() {
                this.realtime?.stop();
                this.mdMirror?.stop();
                this.statusBar?.destroy();
        }
}