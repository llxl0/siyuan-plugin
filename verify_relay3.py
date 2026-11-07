import subprocess, time, urllib.request, json

ADB = 'D:/geek/platform-tools-latest-windows/platform-tools/adb.exe'

def post14(ep, payload={}):
    req = urllib.request.Request('http://127.0.0.1:16806' + ep,
                                 data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')

# 唤醒 14u 保持前台
subprocess.run([ADB, '-s', 'e52055ee', 'shell',
                'svc power stayon usb && input keyevent KEYCODE_WAKEUP && wm dismiss-keyguard'],
               capture_output=True)
subprocess.run([ADB, '-s', 'e52055ee', 'shell',
                'monkey -p org.b3log.siyuan -c android.intent.category.LAUNCHER 1'],
               capture_output=True)

print('等 30 秒（3 轮 ETag 轮询）...')
time.sleep(30)
log = post14('/api/file/getFile', {'path': '/temp/gs_realtime.log'})
lines = [l for l in log.splitlines() if l.strip()]
print('14u rt log:')
for l in lines[-6:]:
    print(' ', l)
print()
print('14u state:', post14('/api/file/getFile',
      {'path': '/data/storage/petal/siyuan-github-sync/github-sync-state.json'})[:120])