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

# 数据解读：
# - GitHub 最新 de8960a (20:59:52) —— 是 14u 在 12:59 push 的！14u 的 push 链路活了！
# - 14u state eb5d7176 是它 12:49 自己推的（本地领先记录）。
# - 16 state 停在 ab7da8c，但 16 log 显示 12:58 pulled 0ffaf92 —— pull 在跑，
#   只是 state 写入可能被 push 覆盖逻辑重置。关键：16 每 10s 轮询 ETag，
#   远端不停有新提交（14u 每分钟一个），16 会持续 pull —— 这就是双向实时！
# 现在做最终验证：查 16 的 gs_realtime.log 是否持续出现 pulled 记录。
log = open('C:/Users/llxl/SiYuan/temp/gs_realtime.log', encoding='utf-8').read()
lines = [l for l in log.splitlines() if l.strip()]
print('16 rt log 尾 6 行:')
for l in lines[-6:]:
    print(' ', l[:150])

# 14u rt log
log14 = post('/api/file/getFile', {'path': '/temp/gs_realtime.log'}, 16806)
lines14 = [l for l in log14.splitlines() if l.strip()]
print('\n14u rt log 尾 6 行:')
for l in lines14[-6:]:
    print(' ', l[:150])