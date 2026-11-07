import re

# gh() 桌面直连 branch 也走 gh()。问题在 RealtimeEngine.pollOnce 的 maybePull 之前？
# 时序：12:23:12 error -> state f89cc50（12:19 的提交），GitHub 12:23:00 有 56cd4ef。
# 也就是：12:23:12 的 pull 尝试是拉 56cd4ef，失败了。之后到 12:29+（我 reload 3 次）
# 每次 reload 后 log 只有 1 条新 error，state 没动。
# reload 后 pollOnce 每 10s 跑 —— 若 ETag fetch 失败会 throw 被外层 catch 吞掉？
# pollOnce 的 try 包住了整个流程，失败静默。但 error 只有 pull error trace。
# 所以现在每轮：ETag 经中继成功（不 trace）→ 发现 56cd4ef → maybePull → pull error！
# = pullFromGitHub 每次都失败。中继 blob OK，那失败点在 pull 的其它 gh() 调用：
# getLatestCommit? compareCommit? tree? 或 updateFile 时 getRepoFileContent(verify)？
# 不对——之前 12:19 f89cc50 是 pull 成功写下的（state 更新成功）。12:23 开始连续失败。
# 区别：12:23 那次提交(56cd4ef)是谁推的？—— 16 端 ab7da8c 之后 56cd4ef、f89cc50……
# f89cc50 是 12:19:17 = 14u 自己 pull 后 state 更新。56cd4ef 12:23:00 = 16 端推的。
# 56cd4ef 内容 = 16 端 19:28 左右 rebuild 索引后推的 data 变更（含 storage/petal 配置?）
# 等等——16 的插件同步范围是 data，包含 storage/petal 的旧 GIT-SYNC 配置？
# 可能 pull 需要下载某个 16 推的文件失败（大文件/编码）。
# 看 56cd4ef 改了什么：
import subprocess
out = subprocess.run(['gh', 'api', 'repos/llxl0/siyuan-notes/commits/56cd4ef1',
                      '--jq', '.files[] | .status + \" \" + (.additions|tostring) + \"+\" + (.deletions|tostring) + \" \" + .filename'],
                     capture_output=True, text=True)
lines = out.stdout.splitlines()
print('56cd4ef 文件数:', len(lines))
for l in lines[:10]:
    print(' ', l[:130])