import subprocess, json

# reload 后 12:25:40 立刻 pull error —— 是 reload 触发的轮询发现新提交 → pull 失败。
# pull 走的是 engine.pullFromGitHub() → gh() → 我的 ghViaKernel。
# 但报 "No internet" = friendlyError 匹配了 "failed to fetch" 或 "network"。
# ghViaKernel 内部 fetch("/api/network/forwardProxy") 是本地请求不该失败……
# 除非：body 太大！pull 需要下载 blobs（raw.githubusercontent 或 git blob API），
# 我们把 blob 下载也走 gh()，forwardProxy 返回的 body 是 JSON 字符串，
# 二进制/大文件会爆或超时 → fetch 异常 → "failed to fetch"。
# 验证：直接在 14u 内核 forwardProxy 一个 blob 下载（851B 的 .sy）看能否成功。

import urllib.request, json, subprocess
ADB = 'D:/geek/platform-tools-latest-windows/platform-tools/adb.exe'
subprocess.run([ADB, '-s', 'e52055ee', 'forward', 'tcp:16806', 'tcp:6806'], capture_output=True)

def post14(ep, payload={}):
    req = urllib.request.Request('http://127.0.0.1:16806' + ep,
                                 data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode('utf-8', 'replace')

# 先拿 GitHub blob sha
out = subprocess.run(['gh', 'api', 'repos/llxl0/siyuan-notes/contents/data/20261105062107-uaivit3/20261105062107-rcts3ju.sy', '--jq', '.sha'], capture_output=True, text=True)
blob_sha = out.stdout.strip()

old = json.load(open('C:/Users/llxl/SiYuan/data/storage/petal/GIT-SYNC-PLUGIN/plugin_config_git_sync_github.json', encoding='utf-8'))
gh_token = old.get('submit_token')

r = post14('/api/network/forwardProxy', {
    'url': f'https://api.github.com/repos/llxl0/siyuan-notes/git/blobs/{blob_sha}',
    'method': 'GET',
    'headers': [{'Authorization': 'Bearer ' + gh_token}, {'Accept': 'application/vnd.github+json'}],
    'timeout': 20000,
    'contentType': 'application/json',
})
d = json.loads(r)
body = d.get('data', {}).get('body', '')
print('blob fetch status:', d.get('data', {}).get('status'), '| body len:', len(body) if body else 0)
print('body head:', (body or '')[:120])