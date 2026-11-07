import json, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

PORT = 16806

def raw(ep, payload={}, timeout=90):
    req = urllib.request.Request(f'http://127.0.0.1:{PORT}' + ep,
                                 data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', 'replace')

cfg = json.loads(raw('/api/file/getFile',
                     {'path': '/data/storage/petal/siyuan-github-sync/github-sync-config.json'}))
tok = cfg.get('token')

tree = json.loads(raw('/api/network/forwardProxy', {
    'url': 'https://api.github.com/repos/llxl0/siyuan-notes/git/trees/main?recursive=1',
    'method': 'GET', 'headers': [{'Authorization': 'Bearer ' + tok}],
    'timeout': 30000, 'contentType': 'application/json',
}))['data']['body']
blobs = [x['sha'] for x in json.loads(tree)['tree'] if x['type'] == 'blob']

def fetch(sha):
    t0 = time.time()
    try:
        r = raw('/api/network/forwardProxy', {
            'url': f'https://api.github.com/repos/llxl0/siyuan-notes/git/blobs/{sha}',
            'method': 'GET', 'headers': [{'Authorization': 'Bearer ' + tok}],
            'timeout': 30000, 'contentType': 'application/json',
        })
        d = json.loads(r)
        return d.get('code') == 0 and d.get('data', {}).get('status') == 200, time.time() - t0
    except Exception:
        return False, time.time() - t0

for conc in [8, 12, 16]:
    batch = blobs[:conc * 2]
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=conc) as ex:
        res = list(ex.map(fetch, batch))
    ok = sum(1 for o, _ in res if o)
    dt = time.time() - t0
    per = dt / len(batch)
    print(f'并发 {conc:2d}: {ok}/{len(batch)} 成功 | 总 {dt:.2f}s | 平均 {per*1000:.0f}ms/个 | 613文件预计 {613*per:.0f}s')
    if ok < len(batch):
        print('   ^ 有失败，不宜采用更高并发')