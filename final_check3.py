import urllib.request, json, re, subprocess

with open('C:/Users/llxl/SiYuan/conf/conf.json', encoding='utf-8') as f:
    tok = re.search(r'"(?:api)?[Tt]oken"\s*:\s*"([^"]+)"', f.read()).group(1)

def post(ep, payload={}, port=6806, tok=None):
    h = {'Content-Type': 'application/json'}
    if tok:
        h['Authorization'] = 'Token ' + tok
    req = urllib.request.Request(f'http://127.0.0.1:{port}' + ep,
                                 data=json.dumps(payload).encode(), headers=h)
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode('utf-8', 'replace')

st16 = json.loads(post('/api/file/getFile',
                       {'path': '/data/storage/petal/siyuan-github-sync/github-sync-state.json'},
                       6806, tok))
st14 = json.loads(post('/api/file/getFile',
                       {'path': '/data/storage/petal/siyuan-github-sync/github-sync-state.json'},
                       16806))
out = subprocess.run(['gh', 'api', 'repos/llxl0/siyuan-notes/commits/main', '--jq', '.sha[0:8]'],
                     capture_output=True, text=True)
h = out.stdout.strip()
print('16  state:', st16.get('commitSha', '')[:8], '| 对齐:', st16.get('commitSha', '')[:8] == h)
print('14u state:', st14.get('commitSha', '')[:8], '| 对齐:', st14.get('commitSha', '')[:8] == h)
print('GitHub :', h)

print('\n--- 16 rt log 尾 ---')
for l in open('C:/Users/llxl/SiYuan/temp/gs_realtime.log', encoding='utf-8').read().splitlines()[-3:]:
    print(' ', l[:180])

print('\n--- 14u rt log 尾 ---')
log = post('/api/file/getFile', {'path': '/temp/gs_realtime.log'}, 16806)
for l in [x for x in log.splitlines() if x.strip()][-3:]:
    print(' ', l[:180])