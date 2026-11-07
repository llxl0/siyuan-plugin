import json, re, time, urllib.request, subprocess

def post(ep, payload={}, port=6806):
    req = urllib.request.Request(f'http://127.0.0.1:{port}' + ep,
                                 data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8', 'replace'))

def head():
    out = subprocess.run(['gh', 'api', 'repos/llxl0/siyuan-notes/commits/main',
                          '--jq', '.sha'], capture_output=True, text=True)
    return out.stdout.strip()

print('=== 14u AI 写入 → 自动 push 测试 ===')
h0 = head()
print('初始 HEAD:', h0[:8])

rows = post('/api/query/sql',
            {'stmt': "SELECT id FROM blocks WHERE type='p' AND box='20261105062107-uaivit3' LIMIT 1"},
            16806)
para = rows['data'][0]['id']
t = time.strftime('%H%M%S')
r = post('/api/transactions', {
    'transactions': [{
        'doOperations': [{
            'action': 'update', 'id': para,
            'data': f'<div data-node-id="{para}" data-type="NodeParagraph" class="p">'
                    f'<div contenteditable="true" spellcheck="false">14u-AI-{t}</div>'
                    f'<div class="protyle-attr" contenteditable="false">\u200b</div></div>',
        }],
        'undoOperations': [],
    }],
    'app': 'ai-writer', 'reqId': int(time.time() * 1000), 'sessionId': 'ai-14u',
}, 16806)
print('transactions:', r.get('code'))

print('等 30 秒...')
time.sleep(30)
h1 = head()
print('之后 HEAD:', h1[:8])
print('>>> 14u AI 写入自动 push:', 'YES ✅' if h1 != h0 else 'NO ❌')