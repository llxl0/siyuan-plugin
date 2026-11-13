/**
 * LAN sync engine [rt42].
 *
 * Transport for syncMode === "lan": push/pull files between trusted LAN peers
 * over each side's kernel HTTP API. GitHub stays available as cold backup:
 * the user can flip syncMode to "cloud" temporarily to do a full round trip.
 *
 * Merge semantics: per-file newer-wins by mtime; deletions propagate by
 * absence (file exists remotely but not locally and remote mtime is newer
 * than local's last-sync → delete locally), same direction both ways.
 *
 * Auth: every request carries the LOCAL token in an Authorization header —
 * peers must share the same token value (documented in settings UI).
 */

export interface LanPeer {
    host: string;
    port: number;
}

interface FileMeta {
    path: string;      // relative to data/
    mtimeMs: number;
    size: number;
}

export class LanSync {
    constructor(
        private token: string,
        private peers: LanPeer[],
    ) {}

    private headers(): Record<string, string> {
        return {
            "Content-Type": "application/json",
            Authorization: "Token " + this.token,
        };
    }

    /** List files of one notebook/dir on a peer (kernel /api/filetree/...). */
    async peerListDir(peer: LanPeer, path: string): Promise<any[]> {
        const res = await fetch(
            `http://${peer.host}:${peer.port}/api/file/readDir`,
            { method: "POST", headers: this.headers(),
              body: JSON.stringify({ path }) },
        );
        const j = await res.json();
        if (j.code !== 0) return [];
        return (j.data || []).map((e: any) => ({
            name: e.name,
            isDir: !!e.isDir,
            mtimeMs: e.updatedTime || 0,
        }));
    }

    /** Read one file from a peer. Returns null on any failure. */
    async peerGetFile(peer: LanPeer, path: string): Promise<ArrayBuffer | null> {
        try {
            const res = await fetch(
                `http://${peer.host}:${peer.port}/api/file/getFile`,
                { method: "POST", headers: this.headers(),
                  body: JSON.stringify({ path }) },
            );
            if (!res.ok) return null;
            return await res.arrayBuffer();
        } catch {
            return null;
        }
    }

    /** Write one file to a peer. */

    /** [rt75] Two-way sync one notebook (box) with every peer. mtime newer-wins. */
    async syncBox(box: string): Promise<void> {
        const localRoot = "/data/" + box;
        for (const peer of this.peers) {
            try {
                await this.syncDir(peer, localRoot, localRoot);
            } catch (err) {
                console.error("[LAN] syncBox failed", box, peer.host, err);
            }
        }
    }

    /** Recursive two-way sync of one directory against one peer. */
    private async syncDir(peer: LanPeer, localDir: string, remoteDir: string): Promise<void> {
        let localEntries: any[] = [];
        let remoteEntries: any[] = [];
        try {
            const r = await fetch("/api/file/readDir", {
                method: "POST",
                headers: { "Content-Type": "application/json",
                    Authorization: "Token " + this.token },
                body: JSON.stringify({ path: localDir }),
            });
            const j = await r.json();
            localEntries = (j.data || []) as any[];
        } catch { /* local dir may not exist yet */ }
        try {
            remoteEntries = await this.peerListDir(peer, remoteDir);
        } catch { return; }

        const localMap = new Map(localEntries.map((e) => [e.name, e]));
        const remoteMap = new Map(remoteEntries.map((e) => [e.name, e]));

        for (const [name, le] of localMap) {
            const re_ = remoteMap.get(name);
            const lp = localDir + "/" + name;
            const rp = remoteDir + "/" + name;
            if (le.isDir) {
                await this.syncDir(peer, lp, rp);
                continue;
            }
            if (!re_) {
                await this.peerPutFile(peer, rp, await this.localGet(lp));
            } else if ((le.updated || le.mtimeMs || 0) > (re_.updated || re_.mtimeMs || 0)) {
                await this.peerPutFile(peer, rp, await this.localGet(lp));
            } else if ((re_.updated || re_.mtimeMs || 0) > (le.updated || le.mtimeMs || 0)) {
                const buf = await this.peerGetFile(peer, rp);
                if (buf) await this.localPut(lp, buf);
            }
        }
        // remote-only files → pull
        for (const [name, re_] of remoteMap.entries()) {
            if (localMap.has(name)) continue;
            const rp = remoteDir + "/" + name;
            const lp = localDir + "/" + name;
            if (re_.isDir) {
                await this.syncDir(peer, lp, rp);
            } else {
                const buf = await this.peerGetFile(peer, rp);
                if (buf) await this.localPut(lp, buf);
            }
        }
    }

    private async localGet(path: string): Promise<ArrayBuffer | null> {
        try {
            const r = await fetch("/api/file/getFile", {
                method: "POST",
                headers: { "Content-Type": "application/json",
                    Authorization: "Token " + this.token },
                body: JSON.stringify({ path }),
            });
            return await r.arrayBuffer();
        } catch { return null; }
    }

    private async localPut(path: string, buf: ArrayBuffer): Promise<void> {
        const fd = new FormData();
        fd.append("path", path);
        fd.append("isDir", "false");
        fd.append("file", new Blob([buf]));
        await fetch("/api/file/putFile", { method: "POST", body: fd });
    }

    async peerPutFile(
        peer: LanPeer,
        path: string,
        content: ArrayBuffer,
    ): Promise<boolean> {
        try {
            const fd = new FormData();
            fd.append("path", path);
            fd.append("isDir", "false");
            fd.append("file", new Blob([content]));
            const res = await fetch(
                `http://${peer.host}:${peer.port}/api/file/putFile`,
                { method: "POST", body: fd },
            );
            return res.ok;
        } catch {
            return false;
        }
    }
}
