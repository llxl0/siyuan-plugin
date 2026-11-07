import re, subprocess

# pull error 仍在。12:45:10 = v6 部署后（12:44:59 realtime start 是 v6）。
# pull 失败点还不在 ghViaKernel。pull 链路还有其它直接 fetch 的地方吗？
# getLatestCommit / compareCommit / getRemoteTree —— 这些都走 gh() → 中继。
# 但注意！pullFromGitHub 的开头 getLatestCommit 若 404（空仓库）→ SyncError?
# 更可疑：SyncEngine 里可能有自己的 isOnline 检查！搜：
out = subprocess.run(['grep', '-n', 'isOnline\\|navigator.onLine\\|online',
                      'D:/DevTools/_forks/siyuan-plugin/src/engine/SyncEngine.ts',
                      'D:/DevTools/_forks/siyuan-plugin/src/api/Github-api.ts'],
                     capture_output=True, text=True)
print(out.stdout[:900])