import json, re, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

PORT = 16806

def post(ep, payload={}, timeout=30):
    req = urllib.request.Request(f'http://127.0.0.1:{PORT}' + ep,
                                 data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8', 'replace'))

def raw(ep, payload={}, timeout=30):
    req = urllib.request.Request(f'http://127.0.0.1:{PORT}' + ep,
                                 data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', 'replace')

# 手动跑一次 push：直接调 forwardProxy 做 git ref 查询，看中继是否健康
cfg = json.loads(raw('/api/file/getFile',
                     {'path': '/data/storage/petal/siyuan-github-sync/github-sync-config.json'}))
tok = cfg.get('token')
print('config user/repo:', cfg.get('username'), cfg.get('repo'), '| token len:', len(tok or ''))

r = post('/api/network/forwardProxy', {
    'url': 'https://api.github.com/repos/llxl0/siyuan-notes/git/refs/heads/main',
    'method': 'GET',
    'headers': [{'Authorization': 'Bearer ' + tok}, {'Accept': 'application/vnd.github+json'}],
    'timeout': 15000,
    'contentType': 'application/json',
})
print('forwardProxy code:', r.get('code'), '| status:', r.get('data', {}).get('status'))
body = r.get('data', {}).get('body', '')
print('body head:', body[:120])