import json, re, time, urllib.request, subprocess

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

# 现状：16 已 pull 到 0ffaf92（日志实锤），14u 的 state 是 eb5d7176（自己的 push 记录，
# 比远端还新——14u 在 20:57 前后自己推过？看 GitHub 最新提交作者）
out = subprocess.run(['gh', 'api', 'repos/llxl0/siyuan-notes/commits',
                      '--jq', '.[0:4][] | .sha[0:7] + \" | \" + .commit.author.date + \" | \" + (.commit.message | split(\"\\n\")[0])'],
                     capture_output=True, text=True)
print('GitHub 最新 4 提交:')
print(out.stdout)

# 16 的 state 为什么还是 ab7da8c？log 显示 12:58:40 pulled -> 0ffaf92，
# 但 state 没写……可能 pull 是 EventSource 的 while 循环里，state 写在 finalizePull
# 但没触发？再等一轮看看 state 是否更新。
print('等 20 秒再查 16 state...')
time.sleep(20)
st16 = json.loads(post('/api/file/getFile',
                       {'path': '/data/storage/petal/siyuan-github-sync/github-sync-state.json'},
                       6806, tok))
print('16 state now:', st16.get('commitSha', '')[:8])

# 14u eb5d7176 是什么？查它是否存在于远端
out = subprocess.run(['gh', 'api', 'repos/llxl0/siyuan-notes/commits/eb5d7176', '--jq', '.sha[0:8] + \" \" + .commit.author.date + \" \" + .author.login'],
                     capture_output=True, text=True)
print('eb5d7176:', out.stdout.strip() or '(不存在于远端——是 14u 本地 push 失败的中间态?)')