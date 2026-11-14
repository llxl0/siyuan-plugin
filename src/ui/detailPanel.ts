/**
 * [rt83] Sync detail panel — three sections (cloud / LAN / off),
 * per-notebook doc+file counts with direction arrows.
 */
import { Plugin } from "siyuan";

export interface PanelDeps {
    plugin: any;
    config: any;
    ledger: any;           // SyncStateLedger
    onClose: () => void;
}

const BOX_RE = /^data\/([0-9]{14}-[a-z0-9]{7})\//;

function countByBox(paths: string[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const p of paths) {
        const m = p.match(BOX_RE);
        if (m) out[m[1]] = (out[m[1]] || 0) + 1;
    }
    return out;
}

async function jsonPost(url: string, body: any, token: string, timeoutMs = 6000): Promise<any> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
        const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json",
                Authorization: "Token " + token },
            body: JSON.stringify(body),
            signal: ctl.signal,
        });
        if (!r.ok) throw new Error(String(r.status));
        return await r.json();
    } finally {
        clearTimeout(t);
    }
}

export class DetailPanel {
    private el: HTMLElement | null = null;

    constructor(private deps: PanelDeps) {}

    public close() {
        this.el?.remove();
        this.el = null;
    }

    public async open() {
        this.close();
        const el = document.createElement("div");
        el.id = "rt-detail-panel";
        el.style.cssText = "position:fixed;top:42px;right:12px;z-index:999;width:420px;"
            + "background:var(--b3-theme-background);border:1px solid var(--b3-border-color);"
            + "border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.25);padding:12px;"
            + "font-size:13px;max-height:80vh;overflow:auto";
        document.body.appendChild(el);
        this.el = el;
        el.innerHTML = "<div style='opacity:.6'>加载中…</div>";

        // close on ✕ / outside click
        const closeHandler = (e: MouseEvent) => {
            const t = e.target as HTMLElement;
            if (t.id === "rt-detail-close") { this.close(); document.removeEventListener("click", closeHandler, true); }
            else if (!el.contains(t) && !t.closest("#toolbar")) {
                this.close(); document.removeEventListener("click", closeHandler, true);
            }
        };
        setTimeout(() => document.addEventListener("click", closeHandler, true), 0);

        const cfg = this.deps.config;
        const kToken = (window as any).siyuan?.config?.api?.token || "";
        const nbResp = await jsonPost("/api/notebook/lsNotebooks", {}, kToken);
        const nbList = ((nbResp?.data?.notebooks || []) as Array<{ id: string; name: string; closed?: boolean }>);
        const nameOf: Record<string, string> = {};
        for (const nb of nbList) nameOf[nb.id] = nb.name;

        const modes: Record<string, string> = cfg.nbSyncModes || {};
        const globalMode: string = cfg.syncMode || "cloud";
        const modeOf = (box: string) => modes[box] || globalMode;

        const boxes = nbList.filter((n) => !n.closed).map((n) => n.id);

        // ---------- local data ----------
        const localDocs: Record<string, number> = {};
        for (const box of boxes) {
            try {
                const kToken = (window as any).siyuan?.config?.api?.token || "";
                const r = await jsonPost("/api/query/sql",
                    { stmt: `SELECT COUNT(*) AS c FROM blocks WHERE type='d' AND box='${box}'` },
                    kToken);
                localDocs[box] = Number(r?.data?.[0]?.c || 0);
            } catch { localDocs[box] = 0; }
        }
        const localFilesByBox = countByBox(this.deps.ledger.snapshot());;
        const localTotal = this.deps.ledger.snapshot().length;

        // ---------- cloud data ----------
        let cloudFilesByBox: Record<string, number> = {};
        let cloudTotal = 0;
        let cloudErr = "";
        try {
            const t = this.deps.config.token || "";
            const repo = this.deps.config.repo || "";
            const user = this.deps.config.username || "";
            const r = await fetch(
                `https://api.github.com/repos/${user}/${repo}/git/trees/main?recursive=1`,
                { headers: { Authorization: "Bearer " + t, Accept: "application/vnd.github+json" } });
            if (!r.ok) throw new Error(String(r.status));
            const j = await r.json();
            const paths: string[] = (j.tree || [])
                .filter((x: any) => x.path.startsWith("data/") && x.path.endsWith(".sy"))
                .map((x: any) => x.path);
            cloudFilesByBox = countByBox(paths);
            cloudTotal = paths.length;
        } catch (e) {
            cloudErr = String(e).slice(0, 60);
        }

        // ---------- LAN peers ----------
        const peers: string[] = cfg.lanPeers || [];
        const lanSections: string[] = [];
        for (const peer of peers) {
            const [host, port] = peer.split(":");
            const base = `http://${host}:${port || 6806}`;
            let reachable = true;
            const peerDocs: Record<string, number> = {};
            try {
                const kToken = (window as any).siyuan?.config?.api?.token || "";
                const r = await jsonPost(base + "/api/query/sql",
                    { stmt: "SELECT box, COUNT(*) AS c FROM blocks WHERE type='d' GROUP BY box" },
                    kToken);
                for (const row of (r.data || [])) peerDocs[row.box] = Number(row.c);
            } catch {
                reachable = false;
            }
            const rows = lanNbs(boxes, modeOf).map((box) => {
                const mine = localDocs[box] ?? 0;
                const theirs = peerDocs[box];
                const arrow = !reachable ? "" : (theirs === undefined ? ""
                    : mine > theirs ? `<span style="color:var(--b3-theme-warning)">↑${mine - theirs}</span>`
                    : mine < theirs ? `<span style="color:var(--b3-theme-primary)">↓${theirs - mine}</span>`
                    : "✅");
                return `<div style="display:flex;justify-content:space-between;padding:1px 0">
                    <span>${nameOf[box] || box}</span>
                    <span>本机 ${mine} · 对端 ${reachable ? theirs : "?"} ${arrow}</span></div>`;
            }).join("");
            lanSections.push(
                `<div style="margin:6px 0">
                    <div style="font-weight:600">${reachable ? "🟢" : "🔴"} ${host}:${port || 6806}
                        <span style="opacity:.7;font-size:12px">${reachable ? "可达" : "不可达"}</span></div>
                    ${rows || "<div style='opacity:.6'>无 LAN 笔记本</div>"}
                </div>`);
        }

        // ---------- render ----------
        const arrowCloud = (box: string) => {
            if (cloudErr) return "";
            const mine = localFilesByBox[box] ?? 0;
            const theirs = cloudFilesByBox[box] ?? 0;
            if (mine > theirs) return `<span style="color:var(--b3-theme-warning)">↑${mine - theirs}</span>`;
            if (mine < theirs) return `<span style="color:var(--b3-theme-primary)">↓${theirs - mine}</span>`;
            return "✅";
        };
        const cloudRows = boxes.filter((b) => modeOf(b) !== "off").map((box) => {
            const ld = localDocs[box] ?? 0;
            const lf = localFilesByBox[box] ?? 0;
            const cf = cloudFilesByBox[box];
            return `<div style="display:flex;justify-content:space-between;padding:2px 0">
                <span>${nameOf[box] || box}</span>
                <span>文档 ${ld} · 文件 ${lf} ↔ 云端 ${cloudErr ? "?" : (cf ?? 0)} ${arrowCloud(box)}</span></div>`;
        }).join("");
        const offRows = boxes.filter((b) => modeOf(b) === "off")
            .map((box) => `<div style="padding:2px 0">${nameOf[box] || box}</div>`).join("");

        const bar = this.deps.plugin.statusBar || {};
        const last = bar.lastCloudSyncText || "—";
        const pr = this.deps.plugin.syncProgress;
        const progressLine = pr
            ? `<div style="font-size:12px;color:var(--b3-theme-primary)"><b>${pr.pct}%</b> ${pr.status}${pr.detail ? " · " + pr.detail : ""}</div>`
            : `<div style="font-size:12px;opacity:.7">空闲</div>`;

        el.innerHTML = `
<div style="display:flex;justify-content:space-between;align-items:center">
  <span style="font-weight:600"><span style="opacity:.75">☁ 云端</span>
    ${cloudErr ? `<span style="color:var(--b3-theme-error)">错误 ${cloudErr}</span>`
      : `${localTotal}/${cloudTotal}`}</span>
  <span id="rt-detail-close" style="cursor:pointer;opacity:.6;padding:0 4px">✕</span>
</div>
<div style="font-size:12px;opacity:.8">上次同步：${last}</div>
${progressLine}
<div style="border-top:1px solid var(--b3-border-color);margin:6px 0"></div>
${cloudRows}
<div style="border-top:1px solid var(--b3-border-color);margin:6px 0"></div>
<div style="font-weight:600"><span style="opacity:.75">🏠 局域网</span>
  ${peers.length === 0 ? '<span style="opacity:.6;font-size:12px">（未配置对端）</span>' : ''}</div>
${lanSections.join("") || (peers.length === 0 ? "" : "")}
<div style="border-top:1px solid var(--b3-border-color);margin:6px 0"></div>
<div style="font-weight:600"><span style="opacity:.75">⛔ 不同步</span>
  ${offRows ? "" : '<span style="opacity:.6;font-size:12px">（无）</span>'}</div>
${offRows}
<div style="margin-top:10px;display:flex;gap:8px">
  <button id="rt-detail-sync" class="b3-button b3-button--outline" style="font-size:12px">手动同步</button>
</div>`;

        const btn = el.querySelector("#rt-detail-sync");
        btn?.addEventListener("click", () => {
            (this.deps.plugin as any).manualSync?.();
        });
        const syncBtn = el.querySelector("#rt-detail-sync");
        syncBtn?.addEventListener("click", async () => {
            (syncBtn as HTMLButtonElement).disabled = true;
            try {
                await (this.deps.plugin as any).engine.pushToGitHub();
                await (this.deps.plugin as any).engine.pullFromGitHub();
            } finally {
                (syncBtn as HTMLButtonElement).disabled = false;
            }
        });
    }
}

function lanNbs(boxes: string[], modeOf: (b: string) => string): string[] {
    return boxes.filter((b) => modeOf(b) === "lan");
}
