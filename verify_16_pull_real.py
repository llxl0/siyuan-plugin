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

# 状态解读：
# 14u: state=8d8ae26f = GitHub HEAD，完全对齐 ✅
# 16:  state 停在 ab7da8c7 但 log 显示 13:40:30 pulled -> 8d8ae26。
# 说明 16 的 pull 成功（文件已落盘+索引），只是 ledger state 文件没更新。
# 这是我在 v9 里 finalizePull 只在「stateUpdated 或 deleted>0」时 save 的逻辑？
# 不对——state 保存走 ledger.save(commitSha) 在 finalizePull 末尾调用。
# 16 的 state 没动 = finalizePull 没执行到 save？或 saveData 落在了
# 另一个 key？直接验证 16 文档树是否真有 14u 推的最新内容：
r = post('/api/filetree/listDocsByPath',
         {'notebook': '20261105062107-uaivit3', 'path': '/'})
names16 = [x['name'] for x in r['data']['files']]
print('16 文档树:', names16)
print()
print('16 是否包含 14u 创建的「测试GitHub同步RT」:',
      any('GitHub同步RT' in n for n in names16))
print('16 是否包含「测试16编辑」(14u 12:4x 推的改名):',
      any(n == '测试16编辑' for n in names16))