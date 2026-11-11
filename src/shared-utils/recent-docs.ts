/**
 * Recent-docs sync (merge-based).
 *
 * `data/storage/recent-doc.json` is SiYuan's per-device "recently opened"
 * list: `[{ doc: id, time: epochMs }, ...]`. Whole-file overwrite caused
 * conflicts in the past (see data/storage/recent-doc_conflict_*), so this
 * helper merges two lists by doc id, keeping the newer timestamp per doc.
 */

export interface RecentDocItem {
    doc?: string;
    id?: string;
    time?: number;
}

/** Parse either {items:[...]} or [...] shapes defensively. */
export function parseRecentDoc(raw: string | null | undefined): RecentDocItem[] {
    if (!raw) return [];
    try {
        const j = JSON.parse(raw);
        const arr = Array.isArray(j)
            ? j
            : Array.isArray(j?.items)
              ? j.items
              : Array.isArray(j?.recentDocs)
                ? j.recentDocs
                : [];
        return arr.filter(
            (x: unknown) => x && typeof x === "object",
        ) as RecentDocItem[];
    } catch {
        return [];
    }
}

export function serializeRecentDoc(items: RecentDocItem[]): string {
    return JSON.stringify({ items });
}

/** Merge two lists: union by doc id, keep newer time, sort desc, cap length. */
export function mergeRecentDocs(
    a: RecentDocItem[],
    b: RecentDocItem[],
    maxKeep = 64,
): RecentDocItem[] {
    const keyOf = (x: RecentDocItem) => x.doc || x.id || "";
    const map = new Map<string, RecentDocItem>();
    for (const item of [...a, ...b]) {
        const k = keyOf(item);
        if (!k) continue;
        const prev = map.get(k);
        if (!prev || (item.time || 0) > (prev.time || 0)) {
            map.set(k, item);
        }
    }
    return [...map.values()]
        .sort((x, y) => (y.time || 0) - (x.time || 0))
        .slice(0, maxKeep);
}