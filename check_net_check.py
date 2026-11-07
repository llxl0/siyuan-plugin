import re, urllib.request

# 关键发现：14u 内核能访问 GitHub（forwardProxy 200），但插件报 No internet。
# 插件怎么判断网络？查源码里 "No internet" 的判定逻辑。
txt = open('D:/DevTools/_forks/siyuan-plugin/src/api/Github-api.ts', encoding='utf-8').read()
for m in re.finditer(r'No internet|isOnline|navigator\.onLine|checkNetwork', txt):
    s = max(0, m.start() - 300)
    print(txt[s:m.end() + 300].replace('\n', ' ')[:600])
    print('---')