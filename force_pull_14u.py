import subprocess, time, urllib.request, json

ADB = 'D:/geek/platform-tools-latest-windows/platform-tools/adb.exe'

def post14(ep, payload={}):
    req = urllib.request.Request('http://127.0.0.1:16806' + ep,
                                 data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')

# 强制让 14u 拉一次最新：把 state 手动改成当前 GitHub HEAD 的「父提交」，
# 这样下一轮 ETag 轮询必然发现差异触发 pull。同时为了验证内核中继 OK。
out = subprocess.run(['gh', 'api', 'repos/llxl0/siyuan-notes/commits/main', '--jq', '.sha'],
                     capture_output=True, text=True)
head = out.stdout.strip()
# 写 state 为一个旧 sha（比如 ab7da8c 的完整值）触发 pull
old_state = json.loads(post14('/api/file/getFile',
                              {'path': '/data/storage/petal/siyuan-github-sync/github-sync-state.json'}))
print('当前 state:', old_state.get('commitSha', '')[:10])
old_state['commitSha'] = '4e91623600000000000000000000000000000000'  # 旧提交，必然触发 pull
import tempfile, os
tmp = tempfile.mktemp(suffix='.json')
json.dump(old_state, open(tmp, 'w', encoding='utf-8'))

bnd = '----S'
body = (f'--{bnd}\r\nContent-Disposition: form-data; name="path"\r\n\r\n'
        f'data/storage/petal/siyuan-github-sync/github-sync-state.json\r\n'
        f'--{bnd}\r\nContent-Disposition: form-data; name="isDir"\r\n\r\nfalse\r\n'
        f'--{bnd}\r\nContent-Disposition: form-data; name="file"; filename="s.json"\r\n'
        f'Content-Type: application/json\r\n\r\n').encode() + json.dumps(old_state).encode() + f'\r\n--{bnd}--\r\n'.encode()
req = urllib.request.Request('http://127.0.0.1:16806/api/file/putFile', data=body,
                             headers={'Content-Type': f'multipart/form-data; boundary={bnd}'})
print('state 回退:', urllib.request.urlopen(req, timeout=20).read().decode()[:40])

# reload 触发
post14('/api/ui/reloadUI', {})
print('等待 40 秒（pull 尝试）...')
time.sleep(40)
log = post14('/api/file/getFile', {'path': '/temp/gs_realtime.log'})
lines = [l for l in log.splitlines() if l.strip()]
print('log 尾 4 行:')
for l in lines[-4:]:
    print(' ', l[:250])
st = json.loads(post14('/api/file/getFile',
                       {'path': '/data/storage/petal/siyuan-github-sync/github-sync-state.json'}))
print('state 现在:', st.get('commitSha', '')[:10], '| GitHub:', head[:10],
      '| 对齐:', st.get('commitSha', '') == head)