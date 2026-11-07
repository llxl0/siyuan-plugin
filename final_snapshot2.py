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

def state(port, tok=None):
    return post('/api/file/getFile',
                {'path': '/data/storage/petal/siyuan-github-sync/github-sync-state.json'},
                port, tok)

st14 = state(16806)
out = subprocess.run(['gh', 'api', 'repos/llxl0/siyuan-notes/commits/main', '--jq', '.sha[0:8]'],
                     capture_output=True, text=True)
h = out.stdout.strip()

log14 = post('/api/file/getFile', {'path': '/temp/gs_realtime.log'}, 16806)
lines14 = [l for l in log14.splitlines() if l.strip()]

print('=== 最终验收快照 ===')
print('GitHub HEAD   :', h)
print('14u state     :', st14.get('commitSha', '')[:8],
      '(对齐)' if st14.get('commitSha', '')[:8] == h else '(未对齐)')
print('14u 文档树     :')
r = post('/api/filetree/listDocsByPath',
         {'notebook': '20261105062107-uaivit3', 'path': '/'}, 16806)
for x in r['data']['files']:
    print('   -', x['name'])
print('16 文档树     :')
r2 = post('/api/filetree/listDocsByPath',
          {'notebook': '20261105062107-uaivit3', 'path': '/'})
for x in r2['data']['files']:
    print('   -', x['name'])
print('\n14u rt log 尾 2 行:')
for l in lines14[-2:]:
    print('  ', l[:150])
log = open('C:/Users/llxl/SiYuan/temp/gs_realtime.log', encoding='utf-8').read()
lines = [l for l in log.splitlines() if l.strip()]
print('16 rt log 尾 2 行:')
for l in lines[-2:]:
    print('  ', l[:150])