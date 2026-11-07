import json, re, time, urllib.request, subprocess

with open('C:/Users/llxl/SiYuan/conf/conf.json', encoding='utf-8') as f:
    tok = re.search(r'"(?:api)?[Tt]oken"\s*:\s*"([^"]+)"', f.read()).group(1)

def post(ep, payload={}, port=6806, tok=None):
    h = {'Content-Type': 'application/json'}
    if tok:
        h['Authorization'] = 'Token ' + tok
    req = urllib.request.Request(f'http://127.0.0.1:{port}' + ep,
                                 data=json.dumps(payload).encode(), headers=h)
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode('utf-8', 'replace')

# 三端最终对齐：16 log 13:00:40 pulled de8960a = 远端最新。
# 16 state 文件停在 ab7da8c 是「旧 GIT-SYNC 的 state 文件混名」？不——
# 文件路径相同。可能 state 写入有条件（只有发生本地变更时才 save）。
# 无论 state 文件值如何，行为层已验证：16 拉到远端最新（de8960a）。
# 现在验证 14u 实时引擎在轮询（13:00:03 realtime start 后应静默轮询）。
# 给它一个观察窗口：
time.sleep(25)
log14 = post('/api/file/getFile', {'path': '/temp/gs_realtime.log'}, 16806)
lines14 = [l for l in log14.splitlines() if l.strip()]
print('14u rt log 尾 4 行:')
for l in lines14[-4:]:
    print(' ', l[:150])

# 16 log
log = open('C:/Users/llxl/SiYuan/temp/gs_realtime.log', encoding='utf-8').read()
lines = [l for l in log.splitlines() if l.strip()]
print('\n16 rt log 尾 4 行:')
for l in lines[-4:]:
    print(' ', l[:150])

# GitHub HEAD
out = subprocess.run(['gh', 'api', 'repos/llxl0/siyuan-notes/commits/main', '--jq', '.sha[0:8]'],
                     capture_output=True, text=True)
print('\nGitHub HEAD:', out.stdout.strip())