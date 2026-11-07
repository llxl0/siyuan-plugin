import { Plugin } from "siyuan";
import { GitPluginConfig, STORAGE_KEY } from "../shared-utils/types";

export class StatusBarUI {
    private statusBarEl: HTMLElement | null = null;

    constructor(
        private plugin: Plugin,
        private config: GitPluginConfig
		) {
			// add UI icons
			plugin.addIcons(
				`<symbol id="iconGitHubUpload" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 13v-4H8l4-4 4 4h-3v4h-2z"/></symbol><symbol id="iconGitHubDownload" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 7v4h3l-4 4-4-4h3V9h2z"/></symbol><symbol id="iconGitHistory" viewBox="0 0 24 24"><path fill="currentColor" d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></symbol>`,
			);
    }

    public attach() {
        const old = document.getElementById("siyuan-github-sync-status");
        if (old) old.remove();

        const tryAttach = (parent: Element) => {
            this.statusBarEl = document.createElement("span");
            this.statusBarEl.id = "siyuan-github-sync-status";
            this.statusBarEl.style.cssText = "font-size:11px;opacity:.65;margin:0 8px;color:var(--b3-theme-on-background);";
            this.update();
            parent.appendChild(this.statusBarEl);
            return true;
        };

        const target = document.querySelector("#statusBar #status") || document.querySelector("#statusBar");
        if (target && tryAttach(target)) return;

        this.statusBarEl = document.createElement("div");
        this.statusBarEl.id = "siyuan-github-sync-status";
        this.statusBarEl.style.cssText = "position:fixed;bottom:0;left:50%;transform:translateX(-50%);z-index:9999;font-size:11px;opacity:.65;pointer-events:none;color:var(--b3-theme-on-background);line-height:24px;";
        this.update();
        document.body.appendChild(this.statusBarEl);
    }

    private update() {
        if (!this.statusBarEl) return;
        if (this.busy) {
            this.statusBarEl.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;">🔄 同步中…</span>`;
            return;
        }
        const local = this.localCount;
        const remote = this.remoteCount;
        if (remote === null) {
            this.statusBarEl.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;" title="等待首次同步">🔄 待同步</span>`;
            return;
        }
        // "local / remote" — shows at a glance whether both sides carry the
        // same number of files. Equal ⇒ in sync; local<remote ⇒ pull pending;
        // local>remote ⇒ push pending.
        let icon = "🔄";
        let hint = "本地 / 远端 文件数（一致即已同步）";
        if (local !== null && local !== remote) {
            icon = local < remote ? "⬇️" : "⬆️";
            hint = local < remote ? `待拉取 ${remote - local} 个文件` : `待推送 ${local - remote} 个文件`;
        }
        const l = local === null ? "--" : String(local);
        this.statusBarEl.innerHTML =
            `<span style="display:inline-flex;align-items:center;gap:4px;" title="${hint}">${icon} ${l}/${remote}</span>`;
    }

    private busy = false;
    private localCount: number | null = null;
    private remoteCount: number | null = null;

    /** Called by the realtime engine when a push/pull starts or finishes. */
    public setBusy(busy: boolean): void {
        this.busy = busy;
        this.update();
    }

    /** Update the file counts shown as "local / remote". */
    public setCounts(local: number | null, remote: number | null): void {
        if (local !== null) this.localCount = local;
        if (remote !== null) this.remoteCount = remote;
        this.update();
    }

    /**
     * Called by the realtime engine after a successful background sync.
     */
    public markSynced(): void {
        this.busy = false;
        this.config.lastSync = Date.now();
        this.update();
        // Fire-and-forget: don't block the sync pipeline on disk I/O.
        void this.plugin.saveData(STORAGE_KEY, this.config);
    }

    public async saveTimestamp() {
        this.config.lastSync = Date.now();
        this.busy = false;
        this.update();
        await this.plugin.saveData(STORAGE_KEY, this.config);
    }
}