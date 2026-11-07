import json, re, time, urllib.request

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

# 复盘：13:34:09 14u 确实 pulled 8d8ae26（我的验收文档那次），
# 但我步骤3只等了 15 秒就查树 —— 太早了。13:34:09 是在步骤5删除之前
# 完成的。真正的问题是步骤5在 14u 上删失败（-1，因为 14u 还没收到该文档）。
# 时间线再对一次：
#   13:35:47 16 创建（本地时间 21:35:47 = UTC 13:35:47？不——内核时间戳）
#   实际上 21:35:47 本地 = 13:35:47 UTC。HEAD 8d8ae26 = 13:13:27 是之前的提交。
#   14u 13:34:09 pulled 8d8ae26 —— 比 16 创建还早 1 分钟。
#   所以 14u 拉的是 8d8ae26（旧提交），而「验收」文档的提交是 16 后续 push 的。
#   步骤3 的 15 秒窗口里 14u ETag 没发现新提交？应该发现了。
# 关键验证：14u 现在有没有「验收」文档（删除前它如果收到过，会被 16 的删除同步掉）
r = post('/api/filetree/listDocsByPath',
         {'notebook': '20261105062107-uaivit3', 'path': '/'}, 16806)
names14 = [x['name'] for x in r['data']['files']]
print('14u 当前文档树:', names14)
print('16 当前文档树:')
r2 = post('/api/filetree/listDocsByPath',
          {'notebook': '20261105062107-uaivit3', 'path': '/'})
print([x['name'] for x in r2['data']['files']])

# 做一次干净的对称测试：这次在 14u 创建，看 16 收到（反向）
print('\n=== 反向测试：14u 创建 → 16 接收 ===')
t = time.strftime('%H%M%S')
r = post('/api/filetree/createDocWithMd',
         {'notebook': '20261105062107-uaivit3',
          'path': f'/反验{t}', 'markdown': f'reverse e2e {t}'}, 16806)
doc = json.loads(r) if isinstance(r, dict) else {}
print('14u 创建:', r.get('data') if isinstance(r, dict) else r)
# 14u 的创建是内核 API 直写 —— 不广播 transactions！
# RT 引擎的 push 触发只能靠真实编辑。所以内核 API 创建的文档要等
# 16 的 ETag……不对，16 不会发现 14u 没推的东西。
# 14u push 的触发源 = ws-main 事务（真实编辑）。
# 内核 API 直写 = 无广播 = 无 push。除非 pollOnce 有本地变更检测（没有）。
# 这就是为什么之前的测试全靠手动/旧机制。
print('等待 30 秒看 14u 是否自动 push（预期：不会，因为 API 直写不广播）...')
time.sleep(30)
out = subprocess.run(['gh', 'api', 'repos/llxl0/siyuan-notes/commits/main',
                      '--jq', '.sha[0:7] + \" \" + .commit.author.date'],
                     capture_output=True, text=True)
print('GitHub HEAD:', out.stdout.strip())