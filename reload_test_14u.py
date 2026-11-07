import subprocess, time, urllib.request, json

ADB = 'D:/geek/platform-tools-latest-windows/platform-tools/adb.exe'

# 假设：14u 前端在 12:23:12 pull error 后插件崩溃/定时器又没了（12:23 后无新日志行）。
# 完整日志只有 1 行 error = realtime start 那行没了？不对——之前显示过 realtime start。
# 现在日志只有 1 行说明文件被覆盖……不对，log 是 append 的（Blob 直写覆盖？）——
# 我们的 _tr 是 putFile 整文件覆盖！所以每次 trace 会把旧日志清掉。这是日志只见 1 行的原因。
# 12:23:12 error 之后 5 分钟无新 trace = 轮询循环死了或一直 304（静默）。
# 但 GitHub HEAD 56cd4ef != state f89cc50，说明 ETag 检查没有发现新提交 = 轮询死了。

# 修复方向：把 _tr 改为 append 模式不可行（forwardProxy/putFile 覆盖）。
# 改为「时间轮转」命名：按 5 分钟窗口命名文件，1 小时自动过期。
# 同时验证轮询是否真的死了：让 14u 前端 reload 一次再看。

subprocess.run([ADB, '-s', 'e52055ee', 'forward', 'tcp:16806', 'tcp:6806'], capture_output=True)

def post14(ep, payload={}):
    req = urllib.request.Request('http://127.0.0.1:16806' + ep,
                                 data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')

# 强制 reload 前端（重载插件 → onload → realtime start）
print(post14('/api/ui/reloadUI', {}))
time.sleep(12)
log = post14('/api/file/getFile', {'path': '/temp/gs_realtime.log'})
print('reload 后 log:', log[:300])
time.sleep(20)
log = post14('/api/file/getFile', {'path': '/temp/gs_realtime.log'})
lines = [l for l in log.splitlines() if l.strip()]
print('20s 后 log 尾 3 行:')
for l in lines[-3:]:
    print(' ', l)
st = json.loads(post14('/api/file/getFile', {'path': '/data/storage/petal/siyuan-github-sync/github-sync-state.json'}))
print('state sha:', st.get('commitSha', '')[:8])