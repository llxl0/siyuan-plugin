import json, re, time, urllib.request, subprocess

with open('C:/Users/llxl/SiYuan/conf/conf.json', encoding='utf-8') as f:
    tok = re.search(r'"(?:api)?[Tt]oken"\s*:\s*"([^"]+)"', f.read()).group(1)

def post(ep, payload={}, port=6806, tok=None, raw=False):
    h = {'Content-Type': 'application/json'}
    if tok:
        h['Authorization'] = 'Token ' + tok
    req = urllib.request.Request(f'http://127.0.0.1:{port}' + ep,
                                 data=json.dumps(payload).encode(), headers=h)
    with urllib.request.urlopen(req, timeout=30) as r:
        t = r.read().decode('utf-8', 'replace')
        return t if raw else json.loads(t)

# 1) 用 createDocWithMd 建一篇干净的文档（拿它的 block id）
t = time.strftime('%H%M%S')
r = post('/api/filetree/createDocWithMd',
         {'notebook': '20261105062107-uaivit3',
          'path': f'/txn-probe-{t}',
          'markdown': 'AI 写入测试 v1'})
doc = r.get('data')
print('doc id:', doc)

# 2) 找到文档里的段落块 id
rows = post('/api/query/sql',
            {'stmt': f"SELECT id,type FROM blocks WHERE root_id='{doc}' AND type='p' LIMIT 1"})
para = rows['data'][0]['id'] if rows.get('data') else None
print('para id:', para)

# 3) 用「编辑器同款」/api/transactions 更新这个段落
before = open('C:/Users/llxl/SiYuan/temp/gs_realtime.log', encoding='utf-8').read()
bl = len([l for l in before.splitlines() if l.strip()])

resp = post('/api/transactions', {
    'transactions': [{
        'doOperations': [{
            'action': 'update',
            'id': para,
            'data': f'<div data-node-id="{para}" data-type="NodeParagraph" class="p"><div contenteditable="true" spellcheck="false">AI 写入测试 v2 {t}</div><div class="protyle-attr" contenteditable="false">\u200b</div></div>',
        }],
        'undoOperations': [],
    }],
    'app': 'ai-writer',
    'reqId': int(time.time() * 1000),
    'sessionId': 'ai-session-1',
})
print('transactions:', resp.get('code'), resp.get('msg', ''))

print('等待 20 秒看 RT 引擎是否自动 push...')
time.sleep(20)

after = open('C:/Users/llxl/SiYuan/temp/gs_realtime.log', encoding='utf-8').read()
al = [l for l in after.splitlines() if l.strip()]
print('新增日志行:')
for l in al[bl:]:
    print('  ', l[:160])
if len(al) == bl:
    print('  (无新增 —— 广播未触发 push)')

out = subprocess.run(['gh', 'api', 'repos/llxl0/siyuan-notes/commits/main',
                      '--jq', '.sha[0:7] + " " + .commit.author.date + " " + (.commit.message | split("\n")[0])'],
                     capture_output=True, text=True)
print('GitHub HEAD:', out.stdout.strip())