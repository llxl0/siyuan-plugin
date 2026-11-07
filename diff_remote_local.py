import json, re, time, urllib.request, subprocess

with open('C:/Users/llxl/SiYuan/conf/conf.json', encoding='utf-8') as f:
    tok = re.search(r'"(?:api)?[Tt]oken"\s*:\s*"([^"]+)"', f.read()).group(1)

def post(ep, payload={}, port=6806, tok=None):
    h = {'Content-Type': 'application/json'}
    if tok:
        h['Authorization'] = 'Token ' + tok
    req = urllib.request.Request(f'http://127.0.0.1:{port}' + ep,
                                 data=json.dumps(payload).encode(), headers=h)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8', 'replace'))

# 「测试GitHub同步RT」在 14u/远端有，16 没有 —— 但 16 log 说 pulled 8d8ae26。
# 可能：pull 时 ledger diff 认为该文件没变（localSha==remoteSha，因为更早一次
# pull 已写入但 createDoc 失败/被过滤）。直接看远端该文件 vs 16 磁盘：
out = subprocess.run(['gh', 'api', 'repos/llxl0/siyuan-notes/contents/data/20261105062107-uaivit3',
                      '--jq', '.[] | .name + \" \" + (.size|tostring)'],
                     capture_output=True, text=True)
print('=== 远端 uaivit3 文件 ===')
print(out.stdout)

import os
print('=== 16 磁盘 ===')
d = 'C:/Users/llxl/SiYuan/data/20261105062107-uaivit3'
for f in sorted(os.listdir(d)):
    if f.endswith('.sy'):
        print(' ', f, os.path.getsize(os.path.join(d, f)), 'B')