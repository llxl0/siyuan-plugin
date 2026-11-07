import re

# getFrontend() 是正确 API。把 Github-api 和 RealtimeEngine、SyncEngine 的
# isMobile 判定统一改为 getFrontend().includes("mobile")。
txt = open('D:/DevTools/_forks/siyuan-plugin/src/api/Github-api.ts', encoding='utf-8').read()
print('Github-api.ts 现有 isMobile:')
for m in re.finditer(r'const isMobile[^;]+;', txt):
    print(' ', m.group(0)[:120])