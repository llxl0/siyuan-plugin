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

def head():
    out = subprocess.run(['gh', 'api', 'repos/llxl0/siyuan-notes/commits/main',
                          '--jq', '.sha'], capture_output=True, text=True)
    return out.stdout.strip()

h0 = head()
print('初始 GitHub HEAD:', h0[:8])

# 真实 AI 写入：用 /api/transactions 更新一个已有段落
rows = post('/api/query/sql',
            {'stmt': "SELECT id, root_id FROM blocks WHERE type='p' AND box='20261105062107-uaivit3' LIMIT 1"})
para = rows['data'][0]['id']
print('目标段落:', para)

t = time.strftime('%H%M%S')
resp = post('/api/transactions', {
    'transactions': [{
        'doOperations': [{
            'action': 'update', 'id': para,
            'data': f'<div data-node-id="{para}" data-type="NodeParagraph" class="p">'
                    f'<div contenteditable="true" spellcheck="false">AI-写-{t}</div>'
                    f'<div class="protyle-attr" contenteditable="false">\u200b</div></div>',
        }],
        'undoOperations': [],
    }],
    'app': 'ai-writer', 'reqId': int(time.time() * 1000), 'sessionId': 'ai-1',
})
print('transactions code:', resp.get('code'))

print('等 25 秒（2s 防抖 + push 时间）...')
time.sleep(25)

h1 = head()
print('之后 GitHub HEAD:', h1[:8])
print('>>> 自动 push 是否发生:', 'YES ✅' if h1 != h0 else 'NO ❌')