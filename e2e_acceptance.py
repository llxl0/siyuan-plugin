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
        return r.read().decode('utf-8', 'replace')

print('=== 端到端验收（我直接做，全程不碰 UI）===')
print()
print('[步骤1] 在 16 用内核 API 写一篇新文档')
t = time.strftime('%H:%M:%S')
r = post('/api/filetree/createDocWithMd',
         {'notebook': '20261105062107-uaivit3',
          'path': f'/验收-{t}',
          'markdown': f'端到端自动验收 {t}'})
doc = json.loads(r).get('data')
print('  16 创建:', doc)

print('[步骤2] 等 16 的 RT 引擎自动 push（事件+轮询兜底，给 25 秒）')
time.sleep(25)

out = subprocess.run(['gh', 'api', 'repos/llxl0/siyuan-notes/commits/main',
                      '--jq', '.sha[0:8] + \" \" + .commit.author.date'],
                     capture_output=True, text=True)
print('  GitHub HEAD:', out.stdout.strip())

print('[步骤3] 等 14u 的 ETag 轮询拉取（再给 15 秒）')
time.sleep(15)

r = post('/api/filetree/listDocsByPath',
         {'notebook': '20261105062107-uaivit3', 'path': '/'}, 16806)
names14 = [x['name'] for x in json.loads(r)['data']['files']]
target = f'验收-{t}'
print('  14u 文档树含「验收」:', [n for n in names14 if '验收' in n])

print('[步骤4] 检查 16 的 UI 无重载（16 文档树也应同时有）')
r = post('/api/filetree/listDocsByPath',
         {'notebook': '20261105062107-uaivit3', 'path': '/'})
names16 = [x['name'] for x in json.loads(r)['data']['files']]
print('  16 文档树含「验收」:', [n for n in names16 if '验收' in n])

print('[步骤5] 清理测试文档')
r = post('/api/filetree/removeDocByID', {'id': doc}, 16806)
print('  14u 删除:', json.loads(r).get('code'))
time.sleep(3)
r = post('/api/filetree/removeDocByID', {'id': doc})
print('  16 删除:', json.loads(r).get('code'))

print('[步骤6] 等删除同步（20 秒）')
time.sleep(20)
r = post('/api/filetree/listDocsByPath',
         {'notebook': '20261105062107-uaivit3', 'path': '/'}, 16806)
names14 = [x['name'] for x in json.loads(r)['data']['files']]
print('  14u 已不含验收文档:', not any('验收' in n for n in names14))

print()
print('=== 两端实时日志尾 ===')
log = open('C:/Users/llxl/SiYuan/temp/gs_realtime.log', encoding='utf-8').read()
for l in [x for x in log.splitlines() if x.strip()][-3:]:
    print('  16 :', l[:150])
log = post('/api/file/getFile', {'path': '/temp/gs_realtime.log'}, 16806)
for l in [x for x in log.splitlines() if x.strip()][-3:]:
    print('  14u:', l[:150])