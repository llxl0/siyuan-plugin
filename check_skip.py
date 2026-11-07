import re, json

# 看 SyncEngine 的 push 是否会把 data/plugins/ 自己也推上去（应该排除）
txt = open('D:/DevTools/_forks/siyuan-plugin/src/engine/SyncEngine.ts', encoding='utf-8').read()
for m in re.finditer(r'SKIP_PATH_FRAGMENTS|LOCKED_EXTENSIONS|SYNC_ROOT|data/plugins', txt):
    s = max(0, m.start() - 80)
    print(txt[s:m.end() + 220].replace('\n', ' ')[:300])
    print('---')