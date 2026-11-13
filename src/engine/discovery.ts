/**
 * [rt77] LAN peer auto-discovery by /24 network scan.
 * Probes http://x.x.x.x:{ports} for SiYuan kernels (fingerprint via
 * /api/system/version returning "3.x.y"), trusts only peers whose kernel
 * accepts OUR api token (same token = same trust domain), then merges them
 * into lanPeers (dedup by ip:port).
 */
import { LanPeer } from "./LanSync";

const PROBE_PORTS = [6806];
const BATCH = 40;

function localNetBase(): string | null {
        return null; // filled by caller-provided seed (we probe from kernel info)
}

/** Probe one candidate: is it a SiYuan kernel that accepts our token? */
async function probe(ip: string, port: number, token: string): Promise<boolean> {
        try {
                const ctl = new AbortController();
                const t = setTimeout(() => ctl.abort(), 1200);
                const r = await fetch(`http://${ip}:${port}/api/system/version`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json",
                                Authorization: "Token " + token },
                        body: "{}",
                        signal: ctl.signal,
                });
                clearTimeout(t);
                if (!r.ok) return false;
                const j = await r.json();
                return typeof j.data === "string" && String(j.data).startsWith("3.");
        } catch {
                return false;
        }
}

/** Scan a /24 base like "192.168.1" (or a full seed list of bases). */
export async function scanLanPeers(bases: string[], token: string,
        known: LanPeer[]): Promise<LanPeer[]> {
        const knownKeys = new Set(known.map((p) => `${p.host}:${p.port}`));
        const found: LanPeer[] = [];
        for (const base of bases) {
                const targets: Array<[string, number]> = [];
                for (let i = 2; i <= 254; i++) {
                        for (const port of PROBE_PORTS) {
                                targets.push([`${base}.${i}`, port]);
                        }
                }
                for (let i = 0; i < targets.length; i += BATCH) {
                        const batch = targets.slice(i, i + BATCH);
                        const res = await Promise.all(batch.map(
                                ([ip, port]) => probe(ip, port, token)
                                        .then((ok) => (ok ? { ip, port } : null))));
                        for (const f of res) {
                                if (!f) continue;
                                const key = `${f.ip}:${f.port}`;
                                if (!knownKeys.has(key)) {
                                        found.push({ host: f.ip, port: f.port });
                                }
                        }
                }
        }
        return found;
}

/** Derive /24 bases from lanPeers or local addresses reported by config. */
export function basesFromPeers(peers: LanPeer[], fallbackBases: string[]): string[] {
        const bases = new Set<string>();
        for (const p of peers) {
                const m = p.host.match(/^(\\d+\\.\\d+\\.\\d+)\\.\\d+$/);
                if (m) bases.add(m[1]);
        }
        for (const b of fallbackBases) bases.add(b);
        return Array.from(bases);
}
