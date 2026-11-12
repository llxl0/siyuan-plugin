import { Plugin } from "siyuan";
import { GitPluginConfig, STORAGE_KEY } from "../shared-utils/types";

export class StatusBarUI {
    private statusBarEl: HTMLElement | null = null;
    /** [rt50] id/name pairs fed by the engine for mode breakdown. */
    public notebookList: { id: string; name: string }[] = [];
    /** [rt53] per-notebook detail rows for the popover. */
    public modeDetail: string = "";
    /** [rt51] notebook id → doc count (fed by index.ts). */
    public nbDocCounts: Record<string, number> = {};
    /** [rt52] notebook id → peer doc count (null = peer unreachable). */
    public nbPeerCounts: Record<string, number | null> = {};
	/** [rt64] last sync direction: "push" | "pull" (drives arrow icon). */
	public lastAction: "push" | "pull" | null = null;
	/** [rt64] per-peer doc counts for the detail panel. */
	public peerDetail: { name: string; host: string; docs: Record<string, number> | null; online: boolean }[] = [];
	/** [rt54] idle | syncing | error — drives the main icon. */
	public syncState: "idle" | "syncing" | "error" = "idle";

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
        // Remove ALL stale elements with our id (previous runs may have
        // attached to body when #statusBar wasn't ready yet - two counters
        // blinking alternately was the visible symptom on tablets).
        document
            .querySelectorAll("#siyuan-github-sync-status")
            .forEach((el) => el.remove());

        const tryAttach = (parent: Element) => {
            this.statusBarEl = document.createElement("span");
            this.statusBarEl.id = "siyuan-github-sync-status";
            // white-space:nowrap — the elapsed suffix grows every second
            // ("59秒前"→"1分0秒前"); without it the bar wraps to 2 lines
            // on narrow (mobile) status bars.
            this.statusBarEl.style.cssText = "font-size:11px;opacity:.65;margin:0 8px;color:var(--b3-theme-on-background);white-space:nowrap;display:inline-block;";
            this.update();
            parent.appendChild(this.statusBarEl);
            return true;
        };

        const target = document.querySelector("#statusBar #status") || document.querySelector("#statusBar");
        if (target && tryAttach(target)) return;

        this.statusBarEl = document.createElement("div");
        this.statusBarEl.id = "siyuan-github-sync-status";
        this.statusBarEl.style.cssText = "position:fixed;bottom:0;left:50%;transform:translateX(-50%);z-index:9999;font-size:11px;opacity:.65;pointer-events:none;color:var(--b3-theme-on-background);line-height:24px;white-space:nowrap;";
        this.update();
        document.body.appendChild(this.statusBarEl);
    }

    /** [rt53] Popover with per-notebook sync details. */
    private showDetail(): void {
        const local = this.localCount ?? 0;
        const remote = this.remoteCount ?? 0;
        const stateText = this.syncState === "syncing"
            ? "🔄 正在同步…"
            : this.syncState === "error" ? "⛔ 上次同步失败"
            : "✅ 已同步";
        let timeLine = "";
        if (this.config.lastSync) {
            const d = new Date(this.config.lastSync);
            const pad = (n: number) => String(n).padStart(2, "0");
            const ts = `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
            timeLine = `<div style="margin-top:6px;font-size:12px;opacity:.75">上次云端同步: ${ts}（${this.fmtElapsed(Date.now() - this.config.lastSync)}）</div>`;
        }
        const rows = this.modeDetail || "（无数据）";
        const el = document.createElement("div");
        el.style.cssText = "position:fixed;bottom:34px;right:12px;z-index:99;"
            + "background:var(--b3-theme-background);border:1px solid var(--b3-border-color);"
            + "border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.25);max-width:380px;"
            + "max-height:50vh;overflow:auto;padding:12px;font-size:13px;line-height:1.9;user-select:text;";
        el.innerHTML = `<div style="font-weight:600">云端: ${local}/${remote} · ${stateText}</div>${timeLine}`
            + `<div style="margin-top:8px;font-weight:600">笔记本同步模式</div>${rows}`
            + `<div style="margin-top:8px;font-size:11px;opacity:.6">点击其他区域关闭</div>`;
        const close = () => el.remove();
        el.addEventListener("click", close);
        document.body.appendChild(el);
        setTimeout(() => {
            const closer = (ev: MouseEvent) => {
                if (!el.contains(ev.target as Node)) {
                    close();
                    document.removeEventListener("click", closer);
                }
            };
            document.addEventListener("click", closer);
        }, 50);
    }

    private update() {
        // [rt60] bottom bar removed — data-only mode; skip DOM rendering
        return;
        if (!this.statusBarEl) return;
        // [rt54] main bar = single state icon (details on click)
        let icon = "✅";
        let color = "var(--b3-theme-primary)";
        let hint = "已同步（点击查看详情）";
        if (this.syncState === "syncing") {
            icon = "🔄";
            color = "var(--b3-theme-warning)";
            hint = "正在同步…（点击查看详情）";
        } else if (this.syncState === "error") {
            icon = "⛔";
            color = "var(--b3-theme-error)";
            hint = "上次同步失败（点击查看详情）";
        }
        this.statusBarEl.innerHTML =
            `<span id="rt-sync-status" style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;color:${color};font-size:14px;" title="${hint}">${icon}</span>`;
        this.statusBarEl
            .querySelector("#rt-sync-status")
            ?.addEventListener("click", () => this.showDetail());
        // syncing 图标转圈动画
        const iconEl = this.statusBarEl.querySelector("#rt-sync-status");
        if (iconEl && this.syncState === "syncing") {
            (iconEl as HTMLElement).style.animation =
                "rt-spin 1s linear infinite";
        } else if (iconEl) {
            (iconEl as HTMLElement).style.animation = "";
        }
    }

    /** Format an elapsed duration compactly in Chinese. */
    private fmtElapsed(ms: number): string {
        const s = Math.floor(ms / 1000);
        if (s < 60) return `${s}秒前`;
        const m = Math.floor(s / 60);
        if (m < 60) return `${m}分${s % 60}秒前`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}小时${m % 60}分前`;
        return `${Math.floor(h / 24)}天${h % 24}小时前`;
    }

    /** Update only the elapsed-suffix span — avoids re-rendering the whole bar. */
    private refreshAgo(): void {
        const el = document.getElementById("gs-sync-ago");
        if (!el) return;
        if (this.config.lastSync) {
            el.textContent = `（${this.fmtElapsed(Date.now() - this.config.lastSync)}）`;
        } else {
            el.textContent = "";
        }
    }

    private ticker: number | null = null;

    /** 1-second ticker that keeps the elapsed-time suffix live. */
    public startTicker(): void {
        if (this.ticker !== null) return;
        this.ticker = window.setInterval(() => {
            // Self-heal: SiYuan mobile rebuilds its dock and can detach or
            // duplicate our element; re-attach if it left the DOM.
            if (this.statusBarEl && !document.contains(this.statusBarEl)) {
                this.attach();
                return;
            }
            if (!this.busy && this.config.lastSync) this.refreshAgo();
        }, 1000);
    }

    /** Stop the ticker (plugin unload). */
    public destroy(): void {
        if (this.ticker !== null) {
            window.clearInterval(this.ticker);
            this.ticker = null;
        }
    }

    private busy = false;
    private busyIcon = "🔄";
    private busyText = "同步中…";
    private localCount: number | null = null;
    private remoteCount: number | null = null;

    /** Called by the realtime engine when a push/pull starts or finishes. */
    public setBusy(busy: boolean): void {
        this.busy = busy;
        if (busy) {
            // Reset the detail line at the start of every op.
            this.busyIcon = "🔄";
            this.busyText = "同步中…";
        }
        this.update();
    }

    /** Live progress (pct 0-100 + short label, e.g. "上传 3/17"). */
    public setProgress(pct: number, text: string): void {
        this.busy = true;
        this.busyIcon = pct >= 100 ? "✅" : "🔄";
        this.busyText = `${text} ${pct}%`;
        this.update();
    }

    /** Update the file counts shown as "local / remote". */
    /** [rt51] Force re-render (doc counts / modes updated). */
    public refresh(): void {
        this.update();
    }

    public setCounts(local: number | null, remote: number | null,
                  state?: "idle" | "syncing" | "error"): void {
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