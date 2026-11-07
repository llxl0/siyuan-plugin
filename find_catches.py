import subprocess, json, time, urllib.request

ADB = 'D:/geek/platform-tools-latest-windows/platform-tools/adb.exe'

# friendlyError 匹配 msg 含 "network" —— GitHub API 错误体若是 403 + body
# "API rate limit exceeded" 不匹配；但「labeld network」可能是ghViaKernel
# throw 的 "forwardProxy: ..." msg？现在不 throw 了。那 raw 是啥？
# 最直接：SyncError(500, friendlyError(e)) —— raw 丢了。给 SyncEngine
# pullFromGitHub 的 catch 加 console.error 原始错误，并把 14u 的错误再次
# 用 raw trace（v6 已有 raw trace，但 raw 也是 friendlyError 后的？不——
# RealtimeEngine 捕获的 e 是 SyncEngine 重新抛的 SyncError，
# message 已经是 friendlyError 结果。原始错误在 SyncEngine 内部被吞。
# 找 SyncEngine pullFromGitHub 的 catch：
out = subprocess.run(['grep', '-n', '-A4', 'catch (e)', 'D:/DevTools/_forks/siyuan-plugin/src/engine/SyncEngine.ts'],
                     capture_output=True, text=True)
print(out.stdout[:1200])