import re

# downloadBlob 走 gh() → 中继 OK。pull error 在别处。
# "No internet" 匹配的是 friendlyError(msg)：'failed to fetch'/'network'。
# pullFromGitHub 里 getLatestCommit / compare 可能直接 fetch？查 sync 相关 fetch。
txt = open('D:/DevTools/_forks/siyuan-plugin/src/engine/SyncEngine.ts', encoding='utf-8').read()
idxs = [m.start() for m in re.finditer(r'await fetch|fetch\(', txt)]
print('SyncEngine fetch 调用数:', len(idxs))
# Github-api 里除 gh/ghViaKernel 外还有直接 fetch？
txt2 = open('D:/DevTools/_forks/siyuan-plugin/src/api/Github-api.ts', encoding='utf-8').read()
cnt = len(re.findall(r'await fetch\(', txt2))
print('Github-api await fetch 次数:', cnt)
for m in re.finditer(r'await fetch\((.{0,120})', txt2):
    print(' ', m.group(1).replace('\n', ' ')[:110])