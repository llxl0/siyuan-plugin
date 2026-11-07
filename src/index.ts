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

        async onunload() {
                this.realtime?.stop();
                this.mdMirror?.stop();
                this.statusBar?.destroy();
        }
}