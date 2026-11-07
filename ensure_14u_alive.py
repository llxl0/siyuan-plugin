import subprocess, time

# 14u 前端可能正在 reload，内核忙。先确保 App 活着 + forward，然后重试
ADB = 'D:/geek/platform-tools-latest-windows/platform-tools/adb.exe'
subprocess.run([ADB, 'forward', 'tcp:16806', 'tcp:6806'], capture_output=True)

import urllib.request, json
for attempt in range(3):
    try:
        r = urllib.request.urlopen(urllib.request.Request(
            'http://127.0.0.1:16806/api/system/version', data=b'{}',
            headers={'Content-Type': 'application/json'}), timeout=8)
        print('kernel alive:', r.read().decode()[:60])
        break
    except Exception as e:
        print(f'attempt {attempt}: kernel dead ({e})')
        subprocess.run([ADB, 'shell', 'am', 'force-stop', 'org.b3log.siyuan'], capture_output=True)
        time.sleep(1)
        subprocess.run([ADB, 'shell', 'monkey', '-p', 'org.b3log.siyuan',
                        '-c', 'android.intent.category.LAUNCHER', '1'], capture_output=True)
        time.sleep(8)
        subprocess.run([ADB, 'forward', 'tcp:16806', 'tcp:6806'], capture_output=True)