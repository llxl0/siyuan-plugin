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

t = time.strftime('%H%M%S')
doc = post('/api/filetree/createDocWithMd',
           {'notebook': '20261105062107-uaivit3',
            'path': f'/txn2-{t}', 'markdown': 'AI v1'}).get('data')
print('doc:', doc)
print('等 6 秒让 SQL 索引落库...')
time.sleep(6)

rows = post('/api/query/sql',
            {'stmt': f"SELECT id,type FROM blocks WHERE root_id='{doc}' AND type='p'"})
if not rows.get('data'):
    print('still no para; give up')
    raise SystemExit
para = rows['data'][0]['id']
print('para:', para)

before = open('C:/Users/llxl/SiYuan/temp/gs_realtime.log', encoding='utf-8').read()
bl = len([l for l in before.splitlines() if l.strip()])

resp = post('/api/transactions', {
    'transactions': [{
        'doOperations': [{
            'action': 'update', 'id': para,
            'data': f'<div data-node-id="{para}" data-type="NodeParagraph" class="p">'
                    f'<div contenteditable="true" spellcheck="false">AI v2 {t}</div>'
                    f'<div class="protyle-attr" contenteditable="false">\u200b</div></div>',
        }],
        'undoOperations': [],
    }],
    'app': 'ai-writer',
    'reqId': int(time.time() * 1000),
    'sessionId': 'ai-session-1',
})
print('transactions:', resp.get('code'), resp.get('msg', ''))
print('等 20 秒...')
time.sleep(20)

after = open('C:/Users/llxl/SiYuan/temp/gs_realtime.log', encoding='utf-8').read()
al = [l for l in after.splitlines() if l.strip()]
print('新增日志:')
new = al[bl:]
for l in new:
    print('  ', l[:160])
if not new:
    print('  (无 → transactions 不广播到插件)')

# 清理
post('/api/filetree/removeDocByID', {'id': doc})
print('已删测试文档')