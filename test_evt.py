import json, re, time, urllib.request

with open('C:/Users/llxl/SiYuan/conf/conf.json', encoding='utf-8') as f:
    tok = re.search(r'"(?:api)?[Tt]oken"\s*:\s*"([^"]+)"', f.read()).group(1)

def post(ep, payload):
    req = urllib.request.Request('http://127.0.0.1:6806' + ep,
                                 data=json.dumps(payload).encode(),
                                 headers={'Authorization': 'Token ' + tok,
                                          'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())

# createDocWithMd 走内核 API 时前端可能不广播 transactions（API 直写）。
# 真实用户编辑（Protyle）才走前端事务。模拟用户编辑：先打开文档再 updateBlock？
# updateBlock 是内核 API，同样可能不广播。
# 真实路径：前端 Protyle 保存时调用 /api/putFile + 广播。用 renameDoc 试试（前端树操作）。
r = post('/api/filetree/renameDocByID',
         {'id': '20261107193912-zbrcp8k', 'title': 'RT测试2-改名' + time.strftime('%H%M%S')})
print('rename:', r.get('code'))
time.sleep(5)

log = open('C:/Users/llxl/SiYuan/temp/gs_realtime.log', encoding='utf-8').read()
print('--- log tail ---')
print('\n'.join(log.splitlines()[-6:]))