import json, time, urllib.request, subprocess

ADB = 'D:/geek/platform-tools-latest-windows/platform-tools/adb.exe'
subprocess.run([ADB, 'forward', 'tcp:16806', 'tcp:6806'], capture_output=True)

def post14(ep, payload={}):
    req = urllib.request.Request('http://127.0.0.1:16806' + ep,
                                 data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')

# "No internet" 是 friendlyError 的模糊匹配（"Failed to fetch"/network 字样），
# 真实错误可能是 fetch 任意失败（限流/超时/DNS）。看 14u 最新 rt log：
print('14u rt log:', post14('/api/file/getFile', {'path': '/temp/gs_realtime.log'})[:300])

# 检查 14u 的 API 限流状态（用内核 forwardProxy 带 token 查 rate_limit）
old = json.load(open('C:/Users/llxl/SiYuan/data/storage/petal/GIT-SYNC-PLUGIN/plugin_config_git_sync_github.json', encoding='utf-8'))
gh_token = old.get('submit_token')
r = post14('/api/network/forwardProxy', {
    'url': 'https://api.github.com/rate_limit',
    'method': 'GET',
    'headers': [{'Authorization': 'Bearer ' + gh_token}],
    'timeout': 15000,
    'contentType': 'application/json',
})
try:
    d = json.loads(r)
    body = json.loads(d['data']['body'])
    core = body['resources']['core']
    print('14u GitHub API 限额: limit=%s remaining=%s reset=%s' % (core['limit'], core['remaining'], core['reset']))
except Exception as e:
    print('parse err:', r[:200])