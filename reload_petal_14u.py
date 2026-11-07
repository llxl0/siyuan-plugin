import json, time, urllib.request, subprocess

PORT = 16810  # 14u
GH = subprocess.run(['gh','auth','token'],capture_output=True,text=True).stdout.strip()

def api(ep, payload, tok=None):
    h = {'Content-Type': 'application/json'}
    if tok: h['Authorization'] = 'Token ' + tok
    req = urllib.request.Request(f'http://127.0.0.1:{PORT}' + ep,
        data=json.dumps(payload).encode(), headers=h)
    return json.loads(urllib.request.urlopen(req, timeout=30).read())

def put(path, content):
    bnd = '----R'
    body = (f'--{bnd}\r\nContent-Disposition: form-data; name="path"\r\n\r\n{path}\r\n'
            f'--{bnd}\r\nContent-Disposition: form-data; name="isDir"\r\n\r\nfalse\r\n'
            f'--{bnd}\r\nContent-Disposition: form-data; name="modTime"\r\n\r\n{int(time.time()*1000)}\r\n'
            f'--{bnd}\r\nContent-Disposition: form-data; name="file"; filename="f"\r\n'
            f'Content-Type: application/json\r\n\r\n').encode() + \
           (content if isinstance(content, bytes) else json.dumps(content, ensure_ascii=False).encode()) + \
           f'\r\n--{bnd}--\r\n'.encode()
    req = urllib.request.Request(f'http://127.0.0.1:{PORT}/api/file/putFile', data=body,
        headers={'Content-Type': f'multipart/form-data; boundary={bnd}'})
    return json.loads(urllib.request.urlopen(req, timeout=30).read()).get('code')

# 1. write a temp marker file that our new code reads ONCE to self-trigger:
#    simpler — directly modify the WS conf to flip the petal disable list twice.
conf = api('/api/system/getConf', {})
disabled = (conf.get('data', {}).get('conf', {}) or {}).get('petal') or {}

def set_disabled(newlist):
    # edit conf.json on disk via putFile (kernel reloads conf on restart only —
    # so we do file-level flip + reloadUI; kernel reads petal state from conf.json)
    import re
    p = 'conf/conf.json'
    raw = api('/api/file/getFile', {'path': p})
    # getFile returns raw bytes; api() wraps json — re-request raw:
    req = urllib.request.Request(f'http://127.0.0.1:{PORT}/api/file/getFile',
        data=json.dumps({'path': p}).encode(), headers={'Content-Type': 'application/json'})
    raw = urllib.request.urlopen(req, timeout=30).read().decode()
    c = json.loads(raw)
    c['conf']['petal']['disabled'] = newlist
    return put(p, raw.encode() if False else json.dumps(c, ensure_ascii=False).encode())

name = 'siyuan-github-sync'
cur = [x for x in (disabled.get('disabled') or [])]

# disable->enable quickly (kernel writes conf; frontend reloads plugins)
r1 = api('/api/petal/setPetalEnabled', {'packageName': name, 'enabled': False, 'frontend': 'mobile'})
print('disable:', r1.get('code'), r1.get('msg','')[:40])
time.sleep(3)
r2 = api('/api/petal/setPetalEnabled', {'packageName': name, 'enabled': True, 'frontend': 'mobile'})
print('enable:', r2.get('code'), r2.get('msg','')[:40])
time.sleep(25)
log = api('/api/file/getFile', {'path': 'temp/gs_mdmirror.log'})
print('--- log tail ---')
print('\n'.join([l for l in log.splitlines() if not l.startswith('{')][-8:]))