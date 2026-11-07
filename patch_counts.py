import re

p = 'src/engine/RealtimeEngine.ts'
t = open(p, encoding='utf-8').read()

# 1) widen the statusBar type to include setCounts
old_type = 'private statusBar?: { setBusy(b: boolean): void; markSynced(): void },'
new_type = (
    'private statusBar?: {\n'
    '                setBusy(b: boolean): void;\n'
    '                markSynced(): void;\n'
    '                setCounts(local: number | null, remote: number | null): void;\n'
    '        },'
)
print('type found:', old_type in t)
t = t.replace(old_type, new_type)

# 2) insert reportCounts() right before the trace section
helper = '''        /** Report local/remote file counts to the status bar (best effort). */
        private async reportCounts(): Promise<void> {
                if (!this.statusBar) return;
                try {
                        const base = `/repos/${this.config.username}/${this.config.repo}`;
                        const refRes = await this.api.gh(`${base}/git/refs/heads/main`);
                        const refJson = (await refRes.json()) as { object?: { sha?: string } };
                        const sha = refJson.object?.sha;
                        if (!sha) return;
                        const cRes = await this.api.gh(`${base}/git/commits/${sha}`);
                        const cJson = (await cRes.json()) as { tree?: { sha?: string } };
                        const treeSha = cJson.tree?.sha;
                        if (!treeSha) return;
                        const tRes = await this.api.gh(`${base}/git/trees/${treeSha}?recursive=1`);
                        const tJson = (await tRes.json()) as {
                                tree?: { type: string; path: string }[];
                        };
                        const remote = (tJson.tree ?? []).filter(
                                (x) => x.type === "blob" && x.path.startsWith("data/"),
                        ).length;
                        const local = Object.keys(this.ledger.getState()).length;
                        this.statusBar.setCounts(local, remote);
                } catch {
                        /* status bar is cosmetic; never let it break sync */
                }
        }

'''
anchor = '        // ---------- trace ----------'
print('anchor found:', anchor in t)
t = t.replace(anchor, helper + anchor, 1)

# 3) call it on start and after each successful sync
old_start = 'this.trace("realtime start poll=" + POLL_MS);'
new_start = old_start + '\n                void this.reportCounts();'
print('start found:', old_start in t)
t = t.replace(old_start, new_start)

old_mark = 'this.statusBar?.markSynced();'
n = t.count(old_mark)
new_mark = old_mark + '\n                                void this.reportCounts();'
print('markSynced count:', n)
t = t.replace(old_mark, new_mark)

open(p, 'w', encoding='utf-8').write(t)
print('patched, reportCounts occurrences:', t.count('reportCounts'))