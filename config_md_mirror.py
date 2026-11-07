import json, time, urllib.request

TOK16 = 'ov016i4uke322wdl'
GH_TOKEN = None
import subprocess
GH_TOKEN = subprocess.run(['gh','auth','token'],capture_output=True,text=True).stdout.strip()

# read existing config, add md fields, write back — both ends
def read_cfg(port, tok=None):
    h = {'Content-Type': 'application/json'}
    if tok: h['Authorization'] = 'Token ' + tok
    req = urllib.request.Request(f'http://127.0.0.1:{port}/api/file/getFile',
        data=json.dumps({'path':'data/storage/petal/siyuan-github-sync/github-sync-config.json'}).encode(), headers=h)
    return json.loads(urllib.request.urlopen(req, timeout=20).read())

def write_cfg(port, cfg, tok=None):
    bnd = '----W'
    body = (f'--{bnd}\r\nContent-Disposition: form-data; name="path"\r\n\r\n'
            f'data/storage/petal/siyuan-github-sync/github-sync-config.json\r\n'
            f'--{bnd}\r\nContent-Disposition: form-data; name="isDir"\r\n\r\nfalse\r\n'
            f'--{bnd}\r\nContent-Disposition: form-data; name="modTime"\r\n\r\n{int(time.time()*1000)}\r\n'
            f'--{bnd}\r\nContent-Disposition: form-data; name="file"; filename="cfg.json"\r\n'
            f'Content-Type: application/json\r\n\r\n').encode() + \
           json.dumps(cfg, ensure_ascii=False).encode() + f'\r\n--{bnd}--\r\n'.encode()
    h = {'Content-Type': f'multipart/form-data; boundary={bnd}'}
    if tok: h['Authorization'] = 'Token ' + tok
    req = urllib.request.Request(f'http://127.0.0.1:{port}/api/file/putFile', data=body, headers=h)
    return json.loads(urllib.request.urlopen(req, timeout=30).read()).get('code')

for port, tok in [(6806, TOK16), (16806, None)]:
    cfg = read_cfg(port, tok)
    before = {k: cfg.get(k) for k in ('mdRepo','mdDir','mdBranch')}
    cfg['mdRepo'] = 'llxl0/notes'
    cfg['mdDir'] = 'data/repo-docs'
    cfg['mdBranch'] = 'main'
    # the mirror needs the md repo token — reuse the main GitHub token
    cfg.setdefault('token', GH_TOKEN)
    code = write_cfg(port, cfg, tok)
    print(f'port {port}: before={before} -> write code={code}')

# reload both UIs
for port, tok in [(6806, TOK16), (16806, None)]:
    h = {'Content-Type': 'application/json'}
    if tok: h['Authorization'] = 'Token ' + tok
    req = urllib.request.Request(f'http://127.0.0.1:{port}/api/ui/reloadUI', data=b'{}', headers=h)
    print(f'reload {port}:', json.loads(urllib.request.urlopen(req, timeout=20).read()).get('code'))