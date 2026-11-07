import re

# 检查 push 的过滤：RT测试 文档在 data/<nb>/... 下，应该被推送。
# 8 秒没动静 —— 可能 ws-main 的 payload 结构不对。查 siyuan 前端事件名。
txt = open('D:/DevTools/_forks/siyuan-plugin/src/index.ts', encoding='utf-8').read()
print('index.ts 引用 eventBus:', 'eventBus' in txt)

# 查 siyuan d.ts 里 eventBus 事件名
import subprocess
out = subprocess.run(['grep', '-rn', 'ws-main', 'D:/DevTools/_forks/siyuan-plugin/node_modules/siyuan/'],
                     capture_output=True, text=True, timeout=30)
print(out.stdout[:800])