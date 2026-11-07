import re, subprocess

# pull 的树过滤确实排除 plugins/ —— 但 56cd4ef 只有 index.js 变化（远端还有其它被删文件）。
# DELETE 提交 689e85e 又删了它。pull 应该只会拿到删除事件。
# 但 12:23~12:29 pull error 持续 —— 在 56cd4ef 存在期间，pull 计划里 index.js 会被
# shouldSkipPath 过滤才对……除非 shouldSkipPath 只匹配 "plugins" 顶层 —— 对！
# relPath = "plugins/siyuan-github-sync/index.js"，SKIP_ROOT_DIRS[0]="plugins" 匹配顶层。
# 所以 pull 不会下载它。那 pull error 到底哪来的？
# 真正原因可能是: push！16 端每个变更后要 push —— ghViaKernel 的 PUT blob 用
# requestBody JSON —— 154KB 的 base64 或 raw body 可能够大，但 12:23 是 16 推的
# index.js（本地直接 fetch 成功）。14u 的 pull error……
# 换个思路：直接在 14u 上手动触发一次完整 pull 看具体错误。
# 插件没有暴露 pull 命令端点，但 RealtimeEngine 每 10s 会自动试。
# 加大日志：把 ghViaKernel 的异常写进 trace。当前 throw 会被 SyncEngine 捕获转
# friendlyError —— 原始 msg 丢了。改 friendlyError 保留原始信息到 trace。
txt = open('D:/DevTools/_forks/siyuan-plugin/src/shared-utils/utils.ts', encoding='utf-8').read()
print(txt[3800:5200])