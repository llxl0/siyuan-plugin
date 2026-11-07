import subprocess, re

# 12:19:35 又报 No internet —— 但 pull 成功过（state=ab7da8c）。
# 分析：RealtimeEngine.pollOnce 里 ETag 检查用的是直接 fetch（不走 gh()！）。
# 我只把 Github-api.gh() 改成了内核中继，但 RealtimeEngine 的 ETag 轮询
# 用的是自己的 fetch 调用 —— 漏改了。确认：
txt = open('D:/DevTools/_forks/siyuan-plugin/src/engine/RealtimeEngine.ts', encoding='utf-8').read()
idx = txt.find('api.github.com')
print(txt[idx-400:idx+300])