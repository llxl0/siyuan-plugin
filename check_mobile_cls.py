import subprocess, re

# RAW = "Failed to fetch" —— 某个 fetch 抛了。ghViaKernel 的本地 fetch 已有 try，
# 所以是 ghViaKernel 之外的 fetch。pull 链路 gh() 全走中继了（isMobile 判定
# body--mobile —— 14u 是 body--mobile 对吧？确认！如果类名不是这个，
# isMobile=false → 走直连 fetch → Failed to fetch！
out = subprocess.run(['grep', '-rn', 'body--mobile\\|body--main', 'D:/DevTools/_forks/siyuan-plugin/node_modules/siyuan/types/index.d.ts'],
                     capture_output=True, text=True)
print(out.stdout[:300])
# 14u 内核 API 探测页面 class 不行 —— 但思源移动端标准类是 "body--mobile"。
# 更稳的判定：window.siyuan.config.system.container === "android" 或 frontend。
# 看 d.ts 里 Frontend / getFrontend：
out = subprocess.run(['grep', '-n', 'getFrontend\\|frontend', 'D:/DevTools/_forks/siyuan-plugin/node_modules/siyuan/siyuan.d.ts'],
                     capture_output=True, text=True)
print(out.stdout[:400])