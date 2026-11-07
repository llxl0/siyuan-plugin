import json, time, urllib.request

# fix 14u plugin.json version via its kernel API (adb forward tcp:16806)
# The 14u copy currently shows 4.0.4-rt1 because deploy_14u.py pushed an
# older plugin.json (dist was rebuilt after the fix script last ran).
bnd = '----V'
pj_path = 'data/plugins/siyuan-github-sync/plugin.json'
data = open('D:/DevTools/_forks/siyuan-plugin/dist/plugin.json', 'rb').read()
body = (f'--{bnd}\r\n'
        f'Content-Disposition: form-data; name="path"\r\n\r\n{pj_path}\r\n'
        f'--{bnd}\r\n'
        f'Content-Disposition: form-data; name="isDir"\r\n\r\nfalse\r\n'
        f'--{bnd}\r\n'
        f'Content-Disposition: form-data; name="modTime"\r\n\r\n{int(time.time()*1000)}\r\n'
        f'--{bnd}\r\n'
        f'Content-Disposition: form-data; name="file"; filename="plugin.json"\r\n'
        f'Content-Type: application/json\r\n\r\n').encode() + data + f'\r\n--{bnd}--\r\n'.encode()
req = urllib.request.Request('http://127.0.0.1:16806/api/file/putFile', data=body,
                             headers={'Content-Type': f'multipart/form-data; boundary={bnd}'})
with urllib.request.urlopen(req, timeout=30) as r:
    print('14u plugin.json put:', r.read().decode()[:60])

req = urllib.request.Request('http://127.0.0.1:16806/api/ui/reloadUI',
                             data=b'{}', headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(req, timeout=20) as r:
    print('14u reload:', r.read().decode()[:60])

# reload 16 too so it picks up rt23 UI code
req = urllib.request.Request('http://127.0.0.1:6806/api/ui/reloadUI',
                             data=b'{}', headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(req, timeout=20) as r:
    print('16 reload:', r.read().decode()[:60])