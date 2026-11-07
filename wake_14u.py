import json, time, urllib.request, subprocess

ADB = 'D:/geek/platform-tools-latest-windows/platform-tools/adb.exe'

def post14(ep, payload={}):
    req = urllib.request.Request('http://127.0.0.1:16806' + ep,
                                 data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')

# 12:05 后 14u 的 realtime 引擎没再写日志 = 静默恢复 OR 引擎死了。
# 思源 Android 前端在熄屏/后台时 JS 定时器被冻结 —— 14u 屏幕可能灭了。
# 强制唤醒 + 前台，然后看引擎是否复活（watchdog 或下一次 ETag 轮询会写日志仅在异常时；
# 正常时静默。要验证引擎活着：手动触发一次 pull error 不行……
# 最直接：看 14u 的 github-sync-state.json 是否被 pull 更新过（12:05 那次 error 前后）
r = post14('/api/file/getFile', {'path': '/data/storage/petal/siyuan-github-sync/github-sync-state.json'})
print('14u state:', r[:200])

# 唤醒屏幕保持 USB 常亮
subprocess.run([ADB, '-s', 'e52055ee', 'shell',
                'svc power stayon usb && input keyevent KEYCODE_WAKEUP && wm dismiss-keyguard'],
               capture_output=True)
# 把思源拉到前台
subprocess.run([ADB, '-s', 'e52055ee', 'shell',
                'monkey -p org.b3log.siyuan -c android.intent.category.LAUNCHER 1'],
               capture_output=True)
print('14u 已唤醒且思源置前台')

# 等 25 秒（> POLL_MS 10s），引擎应当完成至少 1~2 轮 ETag 轮询。
# 若远端有新提交（16 删 conflict 后没推）——无新提交则静默。
# 为了产生可观察证据：16 端先推一个提交（改一篇文档），再看 14u 拉取。
