import urllib.request, json, re

with open('C:/Users/llxl/SiYuan/conf/conf.json', encoding='utf-8') as f:
    tok = re.search(r'"(?:api)?[Tt]oken"\s*:\s*"([^"]+)"', f.read()).group(1)

def post(ep, payload):
    req = urllib.request.Request('http://127.0.0.1:6806' + ep,
                                 data=json.dumps(payload).encode(),
                                 headers={'Authorization': 'Token ' + tok,
                                          'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())

# 1. 重载 UI 载入新插件
print('reloadUI:', post('/api/ui/reloadUI', {}))

# 2. 启用插件（frontend=desktop）
import time
time.sleep(2)
print('enable:', post('/api/petal/setPetalEnabled',
                      {'packageName': 'siyuan-github-sync',
                       'enabled': True, 'frontend': 'desktop'}))