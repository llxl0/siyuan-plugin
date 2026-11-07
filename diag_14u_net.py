import urllib.request, json, time

def post14(ep, payload={}):
    req = urllib.request.Request('http://127.0.0.1:16806' + ep,
                                 data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode('utf-8', 'replace')

# 14u "reading remote repository" = 手动 pull 进行中卡住（网络慢或 API 限流）
# 1) 14u realtime 日志最新状态
print('14u rt log:', post14('/api/file/getFile', {'path': '/temp/gs_realtime.log'})[:400])

# 2) 14u 内核到 GitHub 的连通性（内核进程测试）：用 api/file/getFile 拉 GitHub 不行；
#    用 /api/network/forwardProxy（内核自带代理请求）测 api.github.com
try:
    r = post14('/api/network/forwardProxy', {
        'url': 'https://api.github.com/rate_limit',
        'method': 'GET',
        'timeout': 15000,
        'contentType': 'application/json',
    })
    print('14u->github:', r[:200])
except Exception as e:
    print('forwardProxy err:', e)