import re

# blob 中继 OK。那 pull error 在哪？看 pullFromGitHub 是否有 gh() 之外的 fetch。
txt = open('D:/DevTools/_forks/siyuan-plugin/src/engine/SyncEngine.ts', encoding='utf-8').read()
for m in re.finditer(r'fetch\(', txt):
    s = max(0, m.start() - 150)
    print(txt[s:m.end() + 100].replace('\n', ' ')[:280])
    print('---')