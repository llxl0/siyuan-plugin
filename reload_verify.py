import json, time, urllib.request

TOK = 'ov016i4uke322wdl'  # from conf.json (local SiYuan API token)

def api16(ep, payload):
    req = urllib.request.Request(
        'http://127.0.0.1:6806' + ep,
        data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json', 'Authorization': 'Token ' + TOK})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode()[:120]

# 1. reload 16 so the new rt22 plugin code is loaded
print('reload16:', api16('/api/ui/reloadUI', {}))
time.sleep(4)

# 2. smoke test: check plugin loaded on 16 via log file
import subprocess
out = subprocess.run(['tail', '-5', '/c/Users/llxl/SiYuan/temp/gs_realtime.log'],
                     capture_output=True, text=True)
print('--- 16 realtime log tail ---')
print(out.stdout or '(empty)')