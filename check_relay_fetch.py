import re

# 真错误是 raw TypeError（"Failed to fetch"）→ friendlyError → No internet。
# 需要看哪个 fetch 炸了。ghViaKernel 中 blob OK；但 pull 里还有一个关键：
# getRepoFileContent？查 Siyuan-api 的 getRepoFileContent —— 不对那是思源文件。
# SyncEngine pull 还有 getRemoteTree/getCommit → gh() → 中继。
# 剩下唯一非中继的 GitHub fetch = RealtimeEngine.pollOnce 桌面分支不执行（mobile）。
# 那 "Failed to fetch" 只能来自 ghViaKernel 内部的 fetch("/api/network/forwardProxy")
# —— 本地请求怎会失败？**在内核忙/重启瞬间**会失败！而我们的轮询每 10s 都在打
# forwardProxy，若单次失败 → ghViaKernel throw → pull error（因为 pull 里多次 gh）。
# 且 fetch 网络层错误无 retry！给 ghViaKernel 的本地 fetch 加 try+retry：
txt = open('D:/DevTools/_forks/siyuan-plugin/src/api/Github-api.ts', encoding='utf-8').read()
idx = txt.find('const res = await fetch("/api/network/forwardProxy"')
print(txt[idx-150:idx+400])