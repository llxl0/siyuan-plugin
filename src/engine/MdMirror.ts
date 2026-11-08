/**
 * MdMirror — two-way bridge between an external markdown git repo and a
 * workspace folder, so mobile (14u) can read/edit project docs via Monaco.
 *
 * Direction 1 (pull): ETag-poll the md repo head; on change fetch the tree
 *   diff and write changed/deleted .md files into mdDir (data/repo-docs/).
 * Direction 2 (push): Monaco saves write straight into mdDir; we hash-watch
 *   that dir (light poll, no kernel events for non-.sy files) and commit
 *   changed files back via the GitHub Contents API.
 *
 * The md repo (llxl0/notes) is a SEPARATE repository — never mixed with the
 * .sy sync of siyuan-notes. PC edits flow through the junction + local git
 * (outside this plugin); mobile edits flow through this bridge.
 */

import { GitHubAPI } from "../api/Github-api";
import { SiYuanAPI } from "../api/Siyuan-api";
import { GitPluginConfig } from "../shared-utils/types";

const MD_POLL_MS = 15000; // notes repo changes are rarer; 15s is plenty
const MD_PUSH_DEBOUNCE_MS = 3000;
const TRACE_PATH = "temp/gs_mdmirror.log";

type TreeItem = { type: string; path: string; sha: string; size?: number };

export class MdMirror {
        private plugin: import("siyuan").Plugin;
        private api: GitHubAPI;
        private siyuan: SiYuanAPI;
        private config: GitPluginConfig;

        private pollTimer: ReturnType<typeof setInterval> | null = null;
        private pushTimer: ReturnType<typeof setTimeout> | null = null;
        private watchTimer: ReturnType<typeof setInterval> | null = null;
        private etag: string | null = null;
        private lastKnownSha: string | null = null;
        /** path -> sha of the last version WE pushed or pulled (loop guard). */
        private knownLocal: Map<string, string> = new Map();
        private busy = false;
        private pushEnabled = false;


        constructor(
                plugin: import("siyuan").Plugin,
                api: GitHubAPI,
                siyuan: SiYuanAPI,
                config: GitPluginConfig,
        ) {
                this.plugin = plugin;
                this.api = api;
                this.siyuan = siyuan;
                this.config = config;
        }

        private get repo(): { owner: string; name: string } | null {
                if (!this.config.mdRepo || !this.config.mdRepo.includes("/")) return null;
                const [owner, name] = this.config.mdRepo.split("/");
                return { owner, name };
        }

        private get dir(): string {
                return this.config.mdDir || "data/repo-docs";
        }

        /** Mobile networks cannot reach api.github.com directly — relay
         *  everything through the kernel forwardProxy (same as RealtimeEngine). */
        private get isMobile(): boolean {
                return (
                        typeof document !== "undefined" &&
                        document.body.classList.contains("body--mobile")
                );
        }

        /** GET via direct fetch (desktop) or kernel relay (mobile). */
        private async ghGet(url: string, token: string, etag?: string | null): Promise<{ status: number; etag: string | null; body: string | null }> {
                if (!this.isMobile) {
                        const headers: Record<string, string> = {
                                Authorization: `Bearer ${token}`,
                                Accept: "application/vnd.github+json",
                        };
                        if (etag) headers["If-None-Match"] = etag;
                        const res = await fetch(url, { headers });
                        return {
                                status: res.status,
                                etag: res.headers.get("ETag"),
                                body: res.status === 304 ? null : await res.text(),
                        };
                }
                const hdrs: { key: string; value: string }[] = [
                        { key: "Authorization", value: `Bearer ${token}` },
                        { key: "Accept", value: "application/vnd.github+json" },
                ];
                if (etag) hdrs.push({ key: "If-None-Match", value: etag });
                const pr = await fetch("/api/network/forwardProxy", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                                url,
                                method: "GET",
                                headers: hdrs,
                                timeout: 20000,
                                contentType: "application/json",
                        }),
                });
                const pj = (await pr.json()) as {
                        code: number;
                        data?: { status?: number; body?: string };
                };
                if (pj.code !== 0) return { status: 0, etag: null, body: null };
                return {
                        status: pj.data?.status ?? 0,
                        etag: null,
                        body: pj.data?.status === 304 ? null : pj.data?.body ?? null,
                };
        }

        /** Raw file download via raw.githubusercontent (mobile: relay). */
        private async ghRaw(url: string, token: string): Promise<ArrayBuffer | null> {
                if (!this.isMobile) {
                        const res = await fetch(url, {
                                headers: { Authorization: `Bearer ${token}` },
                        });
                        return res.ok ? await res.arrayBuffer() : null;
                }
                const pr = await fetch("/api/network/forwardProxy", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                                url,
                                method: "GET",
                                headers: [{ key: "Authorization", value: `Bearer ${token}` }],
                                timeout: 30000,
                                responseEncoding: "base64",
                        }),
                });
                const pj = (await pr.json()) as {
                        code: number;
                        msg?: string;
                        data?: { status?: number; body?: string; bodyEncoding?: string };
                };
                if (pj.code !== 0 || (pj.data?.status ?? 0) !== 200) {
                        this.trace(`ghRaw relay fail: ${pj.code} ${pj.msg ?? ""}`);
                        return null;
                }
                const b64 = (pj.data?.body ?? "").replace(/\s/g, "");
                try {
                        const bin = atob(b64);
                        const bytes = new Uint8Array(bin.length);
                        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                        return bytes.buffer;
                } catch {
                        this.trace("ghRaw b64 decode fail");
                        return null;
                }
        }

        /** Write via Contents API (mobile: relay). */
        private async ghWrite(url: string, token: string, payload: object, method: "PUT" | "DELETE"): Promise<{ ok: boolean; body?: string }> {
                if (!this.isMobile) {
                        const res = await fetch(url, {
                                method,
                                headers: {
                                        Authorization: `Bearer ${token}`,
                                        Accept: "application/vnd.github+json",
                                        "Content-Type": "application/json",
                                },
                                body: JSON.stringify(payload),
                        });
                        return { ok: res.ok, body: res.ok ? await res.text() : undefined };
                }
                const pr = await fetch("/api/network/forwardProxy", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                                url,
                                method,
                                headers: [
                                        { key: "Authorization", value: `Bearer ${token}` },
                                        { key: "Accept", value: "application/vnd.github+json" },
                                ],
                                payload: JSON.stringify(payload),
                                timeout: 30000,
                                contentType: "application/json",
                        }),
                });
                const pj = (await pr.json()) as {
                        code: number;
                        data?: { status?: number; body?: string };
                };
                const st = pj.data?.status ?? 0;
                return { ok: st >= 200 && st < 300, body: pj.data?.body };
        }

        public start(): void {
                this.stop();
                if (!this.repo) return;
                // Junction-backed desktop mounts are managed by the PC's own
                // git; only mirror-less mobile devices push via this bridge.
                this.pushEnabled = this.config.mdPush === true;
                this.pollTimer = setInterval(() => void this.pollOnce(), MD_POLL_MS);
                this.watchTimer = setInterval(
                        () => void this.watchLocal(),
                        MD_POLL_MS,
                );
                void this.pollOnce(true);
                this.trace(`mdmirror start repo=${this.config.mdRepo} dir=${this.dir}`);
        }

        public stop(): void {
                if (this.pollTimer) clearInterval(this.pollTimer);
                if (this.watchTimer) clearInterval(this.watchTimer);
                if (this.pushTimer) clearTimeout(this.pushTimer);
                this.pollTimer = this.watchTimer = null;
                this.pushTimer = null;
        }

        // ---------------- direction 1: pull ----------------

        private async pollOnce(force = false): Promise<void> {
                const r = this.repo;
                if (!r || this.busy) return;
                try {
                        const branch = this.config.mdBranch || "main";
                        const refRes = await this.ghGet(
                                `https://api.github.com/repos/${r.owner}/${r.name}/git/refs/heads/${branch}`,
                                this.config.token,
                                this.etag && !force ? this.etag : null,
                        );
                        this.trace(`md poll status=${refRes.status}`);
                        if (refRes.status === 304) return;
                        if (refRes.status !== 200 || !refRes.body) return;
                        this.etag = refRes.etag;
                        const j = JSON.parse(refRes.body) as { object?: { sha?: string } };
                        const sha = j.object?.sha ?? null;
                        if (!sha || sha === this.lastKnownSha) return;
                        const prev = this.lastKnownSha;
                        this.lastKnownSha = sha;
                        if (force) {
                                // First run: materialize the full md tree (repo is small,
                                // <5MB) so mobile actually gets the files on first start.
                                await this.seedKnown(sha);
                                await this.pullAll(sha);
                                return;
                        }
                        this.trace(`md pull ${prev?.slice(0, 7) ?? "?"} -> ${sha.slice(0, 7)}`);
                        await this.pullTreeDiff(sha);
                } catch (e) {
                        this.trace(`md poll error: ${e}`);
                }
        }

        /** Build path->sha map of the remote md tree. */
        private async fetchTree(sha: string): Promise<Map<string, TreeItem>> {
                const r = this.repo!;
                const cRes = await this.ghGet(
                        `https://api.github.com/repos/${r.owner}/${r.name}/git/commits/${sha}`,
                        this.config.token,
                );
                if (cRes.status !== 200 || !cRes.body) return new Map();
                const c = JSON.parse(cRes.body) as { tree?: { sha?: string } };
                if (!c.tree?.sha) return new Map();
                const tRes = await this.ghGet(
                        `https://api.github.com/repos/${r.owner}/${r.name}/git/trees/${c.tree.sha}?recursive=1`,
                        this.config.token,
                );
                if (tRes.status !== 200 || !tRes.body) return new Map();
                const t = JSON.parse(tRes.body) as { tree?: TreeItem[] };
                const map = new Map<string, TreeItem>();
                for (const x of t.tree ?? []) {
                        if (x.type === "blob" && /\.(md|markdown)$/i.test(x.path)) {
                                map.set(x.path, x);
                        }
                }
                return map;
        }


        /** First-run full materialization of every md file. */
        private async pullAll(sha: string): Promise<void> {
                const r = this.repo!;
                const tree = await this.fetchTree(sha);
                this.trace(`md pullAll: ${tree.size} files`);
                for (const [path, item] of tree) {
                        const localItem = await this.readLocal(path);
                        if (localItem && localItem.sha === item.sha) continue;
                        // Use the Contents API (base64 inline) instead of
                        // raw.githubusercontent — the relay handles one
                        // domain only and this avoids CORS/encoding quirks.
                        const cRes = await this.ghGet(
                                `https://api.github.com/repos/${r.owner}/${r.name}/contents/${encodeURI(path)}?ref=${sha}`,
                                this.config.token,
                        );
                        if (cRes.status !== 200 || !cRes.body) continue;
                        const cj = JSON.parse(cRes.body) as { content?: string; encoding?: string };
                        let buf: ArrayBuffer | null = null;
                        if (cj.encoding === "base64" && cj.content) {
                                const bin = atob(cj.content.replace(/\s/g, ""));
                                const bytes = new Uint8Array(bin.length);
                                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                                buf = bytes.buffer;
                        }
                        if (!buf) continue;
                        if (await this.siyuan.putFile(`/${this.dir}/${path}`, buf)) {
                                this.knownLocal.set(path, item.sha);
                                this.trace(`md seeded: ${path}`);
                        }
                }
        }

        private async seedKnown(sha: string): Promise<void> {
                const tree = await this.fetchTree(sha);
                this.knownLocal = new Map(
                        [...tree.entries()].map(([p, it]) => [p, it.sha]),
                );
        }

        private async pullTreeDiff(sha: string): Promise<void> {
                const r = this.repo!;
                const tree = await this.fetchTree(sha);
                // 1) pull changed/new files
                for (const [path, item] of tree) {
                        const known = this.knownLocal.get(path);
                        if (known === item.sha) continue; // unchanged
                        const localItem = await this.readLocal(path);
                        if (localItem && localItem.sha === item.sha) {
                                this.knownLocal.set(path, item.sha);
                                continue; // local already matches (e.g. PC git pulled)
                        }
                        // Local edit pending? Don't clobber — push will upload it.
                        if (
                                localItem &&
                                known &&
                                localItem.sha !== known &&
                                localItem.sha !== item.sha
                        ) {
                                this.trace(`md conflict-keep-local: ${path}`);
                                continue;
                        }
                        const cRes = await this.ghGet(
                                `https://api.github.com/repos/${r.owner}/${r.name}/contents/${encodeURI(path)}?ref=${sha}`,
                                this.config.token,
                        );
                        let buf: ArrayBuffer | null = null;
                        if (cRes.status === 200 && cRes.body) {
                                const cj = JSON.parse(cRes.body) as { content?: string; encoding?: string };
                                if (cj.encoding === "base64" && cj.content) {
                                        const bin = atob(cj.content.replace(/\s/g, ""));
                                        const bytes = new Uint8Array(bin.length);
                                        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                                        buf = bytes.buffer;
                                }
                        }
                        if (!buf) continue;
                        const ok = await this.siyuan.putFile(`/${this.dir}/${path}`, buf);
                        if (ok) {
                                this.knownLocal.set(path, item.sha);
                                this.trace(`md pulled: ${path}`);
                        }
                }
                // 2) delete remote-removed files (only if local matches old remote)
                for (const [path] of this.knownLocal) {
                        if (tree.has(path)) continue;
                        const localItem = await this.readLocal(path);
                        const known = this.knownLocal.get(path)!;
                        if (localItem && localItem.sha !== known) continue; // local edit
                        await this.siyuan.removeFile(`/${this.dir}/${path}`);
                        this.knownLocal.delete(path);
                        this.trace(`md removed: ${path}`);
                }
        }

        // ---------------- direction 2: push ----------------

        /** Walk the local mdDir; on any deviation from knownLocal, debounce a commit. */
        private async watchLocal(): Promise<void> {
                const r = this.repo;
                if (!r || this.busy || !this.pushEnabled) return;
                try {
                        const files = await this.walk(this.dir);
                        let dirty = false;
                        for (const rel of files) {
                                const item = await this.readLocal(rel);
                                if (!item) continue;
                                if (this.knownLocal.get(rel) !== item.sha) {
                                        dirty = true;
                                        break;
                                }
                        }
                        // new local files not yet in knownLocal
                        if (!dirty) {
                                for (const rel of files) {
                                        if (!this.knownLocal.has(rel)) {
                                                dirty = true;
                                                break;
                                        }
                                }
                        }
                        if (dirty && this.pushTimer === null) {
                                this.pushTimer = setTimeout(
                                        () => void this.firePush(),
                                        MD_PUSH_DEBOUNCE_MS,
                                );
                        }
                } catch {
                        /* ignore transient fs errors */
                }
        }

        private async firePush(): Promise<void> {
                this.pushTimer = null;
                const r = this.repo;
                if (!r || this.busy) return;
                this.busy = true;
                try {
                        const branch = this.config.mdBranch || "main";
                        const refRes = await this.ghGet(
                                `https://api.github.com/repos/${r.owner}/${r.name}/git/refs/heads/${branch}`,
                                this.config.token,
                        );
                        if (refRes.status !== 200 || !refRes.body) return;
                        const headSha = (JSON.parse(refRes.body) as { object?: { sha?: string } }).object?.sha as string;
                        const remoteTree = await this.fetchTree(headSha);

                        const files = await this.walk(this.dir);
                        for (const rel of files) {
                                const item = await this.readLocal(rel);
                                if (!item) continue;
                                const remote = remoteTree.get(rel);
                                // Loop guard: only push when local sha differs from BOTH
                                // the last-known state and the remote head.
                                if (this.knownLocal.get(rel) === item.sha) continue;
                                if (remote && remote.sha === item.sha) {
                                        this.knownLocal.set(rel, item.sha);
                                        continue;
                                }
                                const buf = await this.siyuan.getFile(`/${this.dir}/${rel}`);
                                if (!buf) continue;
                                const b64 = this.arrayBufferToBase64(buf);
                                const put = await this.ghWrite(
                                        `https://api.github.com/repos/${r.owner}/${r.name}/contents/${encodeURI(rel)}`,
                                        this.config.token,
                                        {
                                                message: `md mirror: ${rel} (siyuan)`,
                                                content: b64,
                                                branch,
                                                sha: remote?.sha,
                                        },
                                        "PUT",
                                );
                                if (put.ok && put.body) {
                                        try {
                                                const pj = JSON.parse(put.body) as {
                                                        content?: { sha?: string };
                                                };
                                                this.knownLocal.set(
                                                        rel,
                                                        pj.content?.sha ?? item.sha,
                                                );
                                        } catch {
                                                this.knownLocal.set(rel, item.sha);
                                        }
                                        this.trace(`md pushed: ${rel}`);
                                } else {
                                        this.trace(`md push FAILED ${rel}`);
                                }
                        }
                        // deletions: known locally-pushed files that vanished from disk
                        for (const [path] of this.knownLocal) {
                                if (files.includes(path)) continue;
                                const remote = remoteTree.get(path);
                                if (!remote) continue;
                                const del = await this.ghWrite(
                                        `https://api.github.com/repos/${r.owner}/${r.name}/contents/${encodeURI(path)}`,
                                        this.config.token,
                                        {
                                                message: `md mirror: delete ${path} (siyuan)`,
                                                sha: remote.sha,
                                                branch,
                                        },
                                        "DELETE",
                                );
                                if (del.ok) {
                                        this.knownLocal.delete(path);
                                        this.trace(`md deleted: ${path}`);
                                }
                        }
                        this.lastKnownSha = headSha; // may be stale; poll will correct
                } catch (e) {
                        this.trace(`md push error: ${e}`);
                } finally {
                        this.busy = false;
                }
        }

        // ---------------- fs helpers ----------------

        private async walk(relDir: string): Promise<string[]> {
                const out: string[] = [];
                const entries = await this.siyuan.readDir(`/${relDir}`);
                for (const e of entries) {
                        const rel = relDir === this.dir ? e.name : `${relDir.slice(this.dir.length + 1)}/${e.name}`;
                        if (e.isDir) {
                                out.push(...(await this.walk(`${this.dir}/${rel}`.slice(this.dir.length + 1) ? `${this.dir}/${rel}` : this.dir)));
                        } else if (/\.(md|markdown)$/i.test(e.name)) {
                                out.push(rel);
                        }
                }
                return out;
        }

        private async readLocal(rel: string): Promise<{ sha: string } | null> {
                const buf = await this.siyuan.getFile(`/${this.dir}/${rel}`);
                if (!buf) return null;
                return { sha: await this.gitBlobSha(buf) };
        }

        /** Compute the git blob sha (same algorithm GitHub uses). */
        private async gitBlobSha(buf: ArrayBuffer): Promise<string> {
                const data = new Uint8Array(buf);
                const header = new TextEncoder().encode(`blob ${data.length}\0`);
                const merged = new Uint8Array(header.length + data.length);
                merged.set(header);
                merged.set(data, header.length);
                const digest = await crypto.subtle.digest("SHA-1", merged);
                return [...new Uint8Array(digest)]
                        .map((b) => b.toString(16).padStart(2, "0"))
                        .join("");
        }

        private arrayBufferToBase64(buf: ArrayBuffer): string {
                const bytes = new Uint8Array(buf);
                let bin = "";
                const CHUNK = 0x8000;
                for (let i = 0; i < bytes.length; i += CHUNK) {
                        bin += String.fromCharCode(
                                ...bytes.subarray(i, i + CHUNK),
                        );
                }
                return btoa(bin);
        }

        // ---------------- trace ----------------

        private traceChain: Promise<void> = Promise.resolve();

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
                                if (r.ok) prev = await r.text();
                                if (prev.length > 16384) prev = "";
                        } catch {
                                /* absent on first write */
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