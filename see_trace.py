import json, re, time, urllib.request

with open('C:/Users/llxl/SiYuan/conf/conf.json', encoding='utf-8') as f:
    tok = re.search(r'"(?:api)?[Tt]oken"\s*:\s*"([^"]+)"', f.read()).group(1)

def raw(ep, payload={}, port=6806, tok=None):
    h = {'Content-Type': 'application/json'}
    if tok:
        h['Authorization'] = 'Token ' + tok
    req = urllib.request.Request(f'http://127.0.0.1:{port}' + ep,
                                 data=json.dumps(payload).encode(), headers=h)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')

# trace 文件是覆盖写的，只能看到最后一条。直接看现在是什么：
print('=== 16 gs_realtime.log 全文 ===')
print(open('C:/Users/llxl/SiYuan/temp/gs_realtime.log', encoding='utf-8').read()[:800])