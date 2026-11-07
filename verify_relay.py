import json, time, urllib.request

# 14u state.commitSha 已 = ab7da8c（最新）！12:18:25 的 error 是旧代码reload前的尾巴。
# state 是 pull 成功后写的 → 内核中继已生效。
# 再验证一次：14u 现在有没有新的 error（12:18 之后）？
def post14(ep, payload={}):
    req = urllib.request.Request('http://127.0.0.1:16806' + ep,
                                 data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')

# 等下一轮 ETag（10s）确认无新错误
time.sleep(15)
log = post14('/api/file/getFile', {'path': '/temp/gs_realtime.log'})
lines = [l for l in log.splitlines() if l.strip()]
print('14u rt log 全部行:')
for l in lines:
    print(' ', l)

# 唤醒屏幕 + 置前台（避免 Android 冻结 JS 定时器干扰验证）
import subprocess
ADB = 'D:/geek/platform-tools-latest-windows/platform-tools/adb.exe'
subprocess.run([ADB, '-s', 'e52055ee', 'shell',
                'svc power stayon usb && input keyevent KEYCODE_WAKEUP && wm dismiss-keyguard'],
               capture_output=True)
time.sleep(12)
log = post14('/api/file/getFile', {'path': '/temp/gs_realtime.log'})
lines = [l for l in log.splitlines() if l.strip()]
print('12s 后 log 尾行:', lines[-1] if lines else '(空)')