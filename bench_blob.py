import json, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

PORT = 16806

def raw(ep, payload={}, timeout=60):
    req = urllib.request.Request(f'http://127.0.0.1:{PORT}' + ep,
                                 data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', 'replace')

cfg = json.loads(raw('/api/file/getFile',
                     {'path': '/data/storage/petal/siyuan-github-sync/github-sync-config.json'}))
tok = cfg.get('token')

# 取远端树，拿若干 blob sha
tree = json.loads(raw('/api/network/forwardProxy', {
    'url': 'https://api.github.com/repos/llxl0/siyuan-notes/git/trees/main?recursive=1',
    'method': 'GET',
    'headers': [{'Authorization': 'Bearer ' + tok}],
    'timeout': 30000, 'contentType': 'application/json',
}))['data']['body']
t = json.loads(tree)
blobs = [x['sha'] for x in t['tree'] if x['type'] == 'blob'][:12]
print('测试 blob 数:', len(blobs))

def fetch(sha):
    t0 = time.time()
    try:
        r = raw('/api/network/forwardProxy', {
            'url': f'https://api.github.com/repos/llxl0/siyuan-notes/git/blobs/{sha}',
            'method': 'GET',
            'headers': [{'Authorization': 'Bearer ' + tok}],
            'timeout': 30000, 'contentType': 'application/json',
        }, timeout=60)
        d = json.loads(r)
        ok = d.get('code') == 0 and d.get('data', {}).get('status') == 200
        return ok, time.time() - t0
    except Exception as e:
        return False, time.time() - t0

print('\n=== 串行 6 个 ==="')
t0 = time.time()
for s in blobs[:6]:
    ok, dt = fetch(s)
    print(f'  {"OK " if ok else "FAIL"} {dt*1000:.0f}ms')
print(f'串行总耗时: {time.time()-t0:.2f}s')

print('\n=== 并发 5 个 ==="')
t0 = time.time()
with ThreadPoolExecutor(max_workers=5) as ex:
    res = list(ex.map(fetch, blobs[6:11]))
for ok, dt in res:
    print(f'  {"OK " if ok else "FAIL"} {dt*1000:.0f}ms')
print(f'并发总耗时: {time.time()-t0:.2f}s  | 成功 {sum(1 for o,_ in res if o)}/5')