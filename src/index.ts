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
const SELF_VERSION = "4.0.4-rt46";

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
                        this.statusBar.startTicker();
                }, 1000);

                this.addTopBar({
                        icon: "iconGitHubUpload",
                        title: t("top.push_title"),
                        position: "right",
                        callback: async () => {
                                this.isManualSync = true;
                                try {
                                        await this.engine.pushToGitHub();
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
		// [rt43] sync-mode badges on the doc tree (2s light calibration)
		setInterval(() => this.markSyncModeBadges(), 2000);

                this.addTopBar({
                        icon: "iconGitHubDownload",
                        title: t("top.pull_title"),
                        position: "right",
                        callback: async () => {
                                this.isManualSync = true;
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

        async onunload() {
                this.realtime?.stop();
                this.mdMirror?.stop();
                this.statusBar?.destroy();
        }
}