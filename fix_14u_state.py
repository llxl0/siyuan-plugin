import json, time, urllib.request

PORT = 16806
CFG = '/data/storage/petal/siyuan-github-sync/github-sync-state.json'

# 1. 从 16 读完整 state（608 条文件记录）
d16 = json.load(open('C:/Users/llxl/SiYuan/data/storage/petal/siyuan-github-sync/github-sync-state.json',
                     encoding='utf-8'))
print('16 state: commitSha=', d16.get('commitSha', '')[:12], '| files=', len(d16.get('files') or {}))

# 2. 写入 14u（两端 data 目录本应一致，账本可共享）
bnd = '----S'
body = (f'--{bnd}\r\nContent-Disposition: form-data; name="path"\r\n\r\n{CFG}\r\n'
        f'--{bnd}\r\nContent-Disposition: form-data; name="isDir"\r\n\r\nfalse\r\n'
        f'--{bnd}\r\nContent-Disposition: form-data; name="modTime"\r\n\r\n{int(time.time()*1000)}\r\n'
        f'--{bnd}\r\nContent-Disposition: form-data; name="file"; filename="s.json"\r\n'
        f'Content-Type: application/json\r\n\r\n').encode() + json.dumps(d16).encode() + f'\r\n--{bnd}--\r\n'.encode()
req = urllib.request.Request(f'http://127.0.0.1:{PORT}/api/file/putFile', data=body,
                             headers={'Content-Type': f'multipart/form-data; boundary={bnd}'})
print('写入 14u:', urllib.request.urlopen(req, timeout=30).read().decode()[:50])

# 3. 验证
r = urllib.request.urlopen(urllib.request.Request(
    f'http://127.0.0.1:{PORT}/api/file/getFile',
    data=json.dumps({'path': CFG}).encode(),
    headers={'Content-Type': 'application/json'}), timeout=25)
d14 = json.loads(r.read().decode())
print('14u state now: commitSha=', d14.get('commitSha', '')[:12], '| files=', len(d14.get('files') or {}))

# 4. 重置 RT 引擎（清掉脏的内存态）
for _ in range(2):
    req2 = urllib.request.Request(f'http://127.0.0.1:{PORT}/api/ui/reloadUI', data=b'{}',
                                  headers={'Content-Type': 'application/json'})
    urllib.request.urlopen(req2, timeout=25).read()
    time.sleep(3)
print('14u UI reloaded')