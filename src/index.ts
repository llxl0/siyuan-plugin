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
import { LanSync } from "./engine/LanSync";
import { scanLanPeers } from "./engine/discovery";
import { DetailPanel } from "./ui/detailPanel";
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
const SELF_VERSION = "4.0.4-rt71";

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
		// [diag marker] prove onload runs
		try {
			const fd = new FormData();
			fd.append("path", "/data/plugins/siyuan-github-sync-rt/onload-marker.txt");
			fd.append("isDir", "false");
			fd.append("file", new Blob(["onload ran " + Date.now()]));
			fetch("/api/file/putFile", { method: "POST", body: fd });
		} catch (e) { console.error("marker fail", e); }
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
					const found = Array.from(document.querySelectorAll("#toolbar .toolbar__item"))
						.find((e) => (e.getAttribute("title") || "").indexOf("同步状态") >= 0);
					if (found) found.id = "plugin_siyuan-github-sync-rt:rt-sync-state";
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


                                // [rt70] restore independent push button
                                this.addTopBar({
                                        icon: "iconGitHubUpload",
                                        title: t("top.push_title"),
                                        position: "right",
                                        callback: async () => {
                                                this.isManualSync = true;
                                                if (this.statusBar) { this.statusBar.syncState = "syncing"; this.statusBar.lastAction = "push"; }
                                                try {
                                                        await this.engine.pushToGitHub();
                                                        if (this.statusBar) this.statusBar.syncState = "idle";
                                                        await this.statusBar.saveTimestamp();
                                                } catch (err) {
                                                        if (this.statusBar) this.statusBar.syncState = "error";
                                                        const msg =
                                                                err instanceof SyncError ? err.message : friendlyError(err);
                                                        showMessage(msg, 6000, "error");
                                                } finally {
                                                        this.isManualSync = false;
                                                }
                                        },
                                });
		// [rt43] sync-mode badges on the doc tree (2s light calibration)
		setInterval(() => this.markSyncModeBadges(), 2000);
		// [rt59] state icon auto-refresh (2s, cheap)
		setInterval(() => this.refreshStateIcon(), 2000);
		// [diag marker2] onload finished
		try {
			const fd2 = new FormData();
			fd2.append("path", "/data/plugins/siyuan-github-sync-rt/onload-marker2.txt");
			fd2.append("isDir", "false");
			fd2.append("file", new Blob(["onload finished " + Date.now()]));
			fetch("/api/file/putFile", { method: "POST", body: fd2 });
		} catch (e) { console.error("marker2 fail", e); }
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

                // [rt75/rt79] LAN transport wiring (merge persisted discovered peers)
                try {
                        const savedLan = await this.loadData('lan-peers');
                        const savedList: string[] = savedLan?.lanPeers || [];
                        const cur = new Set(this.config.lanPeers || []);
                        for (const v of savedList) cur.add(v);
                        this.config.lanPeers = Array.from(cur);
                } catch { /* first run */ }
                if (this.config.lanPeers?.length) {
                        const kToken = (window as any).siyuan?.config?.api?.token || "";
                        const lan = new LanSync(
                                kToken,
                                (this.config.lanPeers || []).map((p) => {
                                        const [host, port] = p.split(":");
                                        return { host, port: Number(port) || 6806 };
                                }),
                        );
                        this.engine.setLanSync(lan);
                }

                // [rt77] periodic LAN peer auto-discovery (network scan)
                const DEFAULT_BASES = ["192.168.1", "192.168.0", "192.168.43",
                        "172.20.10"];
                let lanScanBusy = false;
                const lanScan = async () => {
                        if (lanScanBusy) return;
                        lanScanBusy = true;
                        try {
                                const kToken = (window as any).siyuan?.config?.api?.token || "";
                                const known = (this.config.lanPeers || []).map((p) => {
                                        const [host, port] = p.split(":");
                                        return { host, port: Number(port) || 6806 };
                                });
                                const bases = new Set<string>(DEFAULT_BASES);
                                for (const p of known) {
                                        const m = p.host.match(/^(\d+\.\d+\.\d+)\.\d+$/);
                                        if (m) bases.add(m[1]);
                                }
                                const found = await scanLanPeers(
                                        Array.from(bases), kToken, known);
                                if (found.length > 0) {
                                        const merged = [...(this.config.lanPeers || [])];
                                        for (const f of found) {
                                                merged.push(`${f.host}:${f.port}`);
                                        }
                                        this.config.lanPeers = merged;
                                        await this.saveData('lan-peers',
                                                {lanPeers: merged});
                                        const kToken2 = (window as any).siyuan?.config?.api?.token || "";
                                        const lanNew = new LanSync(kToken2, merged.map((p) => {
                                                const [host, port] = p.split(":");
                                                return { host, port: Number(port) || 6806 };
                                        }));
                                        this.engine.setLanSync(lanNew);
                                        showMessage(`LAN 自动发现：新增 ${found.length} 台对端`, 5000);
                                }
                        } catch (err) {
                                console.warn("[LAN] scan failed", err);
                        } finally {
                                lanScanBusy = false;
                        }
                };
                this.lanScan = lanScan;
                setTimeout(lanScan, 15_000);

                // [rt81] live progress for tooltip + detail panel
                this.engine.on("progress", (pct: number, status: string, details?: string) => {
                        this.syncProgress = { pct, status, detail: details };
                        this.refreshStateIcon();
                        // [rt83] 面板开着时节流刷新（3s）
                        const now = Date.now();
                        if (this.detailPanel && this.detailEl
                                && document.body.contains(this.detailEl)
                                && (!this._lastPanelRefresh || now - this._lastPanelRefresh > 3000)) {
                                this._lastPanelRefresh = now;
                                this.showSyncDetail();
                        }
                });
                setInterval(lanScan, 600_000);

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
        showSyncDetail(): void {
                if (!this.detailPanel) {
                        this.detailPanel = new DetailPanel({
                                plugin: this,
                                config: this.config,
                                ledger: this.ledger,
                                onClose: () => { this.detailEl = null; },
                        });
                }
                this.detailPanel.open();
        }

        /** [rt72] Refresh the combo state icon (inline SVG, 3 states). */
        refreshStateIcon(): void {
            const bar = this.statusBar as any;
            const state = bar?.syncState || "idle";
            const dir = bar?.lastAction || "push";
            let btn = document.getElementById("plugin_siyuan-github-sync-rt:rt-sync-state") as HTMLElement;
            if (!btn) {
                btn = Array.from(document.querySelectorAll("#toolbar .toolbar__item"))
                    .find((e) => (e.getAttribute("title") || "").indexOf("同步状态") >= 0) as HTMLElement;
                if (btn) btn.id = "plugin_siyuan-github-sync-rt:rt-sync-state";
            }
            if (!btn) return;
            const b = btn as HTMLElement;
            const w = 'width="14" height="14" viewBox="0 0 16 16" style="fill:currentColor"';
            if (state === "syncing") {
                b.style.color = "var(--b3-theme-warning)";
                b.style.animation = "rt-spin 1s linear infinite";
                b.innerHTML = `<svg ${w}><path d="M12.6 6.6A4.7 4.7 0 0 0 4.4 4.4L5.8 5.8H1.9V1.9l1.4 1.4A6.2 6.2 0 0 1 14.1 6.6h-1.5zM3.4 9.4a4.7 4.7 0 0 0 8.2 2.2L10.2 10.2H14.1V14.1l-1.4-1.4a6.2 6.2 0 0 1-10.8-2.2h1.5z"/></svg>`;
                const pr = this.syncProgress;
                b.title = pr ? `同步中 ${pr.pct}% ${pr.status}${pr.detail ? " · " + pr.detail : ""}`
                        : "正在同步…";
            } else if (state === "error") {
                b.style.color = "var(--b3-theme-error)";
                b.style.animation = "";
                b.innerHTML = `<svg ${w}><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1zm0 8.2a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2z"/></svg>`;
                b.title = "上次同步失败（点击查看详情）";
            } else {
                b.style.color = "";
                b.style.animation = "";
                b.innerHTML = dir === "pull"
                    ? `<svg ${w} opacity="0.8"><path d="M2 4h12v2H2V4zm0 6h12v2H2v-2z"/></svg>`
                    : `<svg ${w}><path d="M2 4h12v2H2V4zm0 6h12v2H2v-2z"/></svg>`;
                b.title = "已同步（点击查看详情）";
            }
            b.dataset.iconState = state;
        }


        public lanScan?: () => Promise<void>;
        public syncProgress?: { pct: number; status: string; detail?: string } | null;
        public detailPanel?: DetailPanel;
        public _lastPanelRefresh = 0;
        public detailEl: HTMLElement | null = null;

        async onunload() {
                this.realtime?.stop();
                this.mdMirror?.stop();
                this.statusBar?.destroy();
        }
}