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
