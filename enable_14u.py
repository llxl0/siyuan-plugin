import subprocess, time, urllib.request, json

ADB = 'D:/geek/platform-tools-latest-windows/platform-tools/adb.exe'

def post14(ep, payload={}):
    req = urllib.request.Request('http://127.0.0.1:16806' + ep,
                                 data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode('utf-8', 'replace'))

# 14u: 启用插件（mobile 前端）
time.sleep(5)
for i in range(3):
    r = post14('/api/petal/setPetalEnabled',
               {'packageName': 'siyuan-github-sync', 'enabled': True, 'frontend': 'mobile'})
    print(f'enable try{i}:', r.get('code'), r.get('msg', ''))
    if r.get('code') == 0:
        break
    # 先 reloadUI 让内核重扫
    post14('/api/ui/reloadUI', {})
    time.sleep(4)

print('reload:', post14('/api/ui/reloadUI', {}).get('code'))
time.sleep(10)

# 验证：14u 的 gs_realtime.log
r = post14('/api/file/getFile', {'path': '/temp/gs_realtime.log'})
print('14u realtime log:', r if isinstance(r, dict) and r.get('code') == 404 else r)