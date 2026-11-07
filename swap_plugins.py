import urllib.request, json, re, time

with open('C:/Users/llxl/SiYuan/conf/conf.json', encoding='utf-8') as f:
    tok = re.search(r'"(?:api)?[Tt]oken"\s*:\s*"([^"]+)"', f.read()).group(1)

def post(ep, payload):
    req = urllib.request.Request('http://127.0.0.1:6806' + ep,
                                 data=json.dumps(payload).encode(),
                                 headers={'Authorization': 'Token ' + tok,
                                          'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())

# 先禁用旧 GIT-SYNC-PLUGIN（避免两个 git 同步打架）
print('disable GIT-SYNC-PLUGIN:', post('/api/petal/setPetalEnabled',
      {'packageName': 'GIT-SYNC-PLUGIN', 'enabled': False, 'frontend': 'desktop'}).get('code'))
time.sleep(2)
# reloadUI 让内核重新扫描 plugins 目录
print('reloadUI 1:', post('/api/ui/reloadUI', {}).get('code'))
time.sleep(3)
print('reloadUI 2:', post('/api/ui/reloadUI', {}).get('code'))
time.sleep(3)
# 尝试启用
for i in range(3):
    r = post('/api/petal/setPetalEnabled',
             {'packageName': 'siyuan-github-sync', 'enabled': True, 'frontend': 'desktop'})
    print(f'enable try{i}:', r.get('code'), r.get('msg', ''))
    if r.get('code') == 0:
        break
    time.sleep(3)