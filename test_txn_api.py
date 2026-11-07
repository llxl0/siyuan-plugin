import subprocess

# 内核 API 直改不广播给前端 ws —— 广播只在「前端发起的 Protyle 事务」。
# 所以事件推送只能靠真实编辑器输入。但 polling 每 10s 有 ETag 兜底。
# 真正需要验证的链路：
#   16 内核 API 改 -> 无事件 -> 但 10s 内 ETag 无变化（自己没推）-> 矛盾!
# 关键理解：16 的内核 API 改动根本没进 git（没人推送），所以对端也不知道。
# 结论：内核 API 改动必须由「轮询本地变更」兜底 —— 增加一个 10s 的本地
# 数据库 mtime 巡检不可行；正确做法是监听内核广播 OR 依赖用户在前端编辑。
# 用户正常打字必走 Protyle -> 前端广播 -> firePush。先手动模拟一次真实前端事务：
# 思源 API 有 /api/transactions（前端保存就是调它），调它=完全模拟用户保存！
payload = {
    "transaction": "20261107193912-zbrcp8k",
}
import urllib.request, json, re, time
with open('C:/Users/llxl/SiYuan/conf/conf.json', encoding='utf-8') as f:
    tok = re.search(r'"(?:api)?[Tt]oken"\s*:\s*"([^"]+)"', f.read()).group(1)

def post(ep, p):
    req = urllib.request.Request('http://127.0.0.1:6806' + ep,
                                 data=json.dumps(p).encode(),
                                 headers={'Authorization': 'Token ' + tok,
                                          'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())

# /api/transactions 真实签名: {transaction: [{doOperations:[...], undoOperations:[...]}], app: "app"}
r = post('/api/transactions', {
    'transactions': [{
        'doOperations': [{'action': 'update', 'id': '20261107193912-zbrcp8k',
                          'data': '<div data-node-id="x">Realtime E2E test ' + str(int(time.time())) + '</div>'}],
        'undoOperations': []
    }],
    'app': 'test-app',
    'reqId': int(time.time() * 1000),
    'sessionId': 'test-session',
})
print('transactions API:', r.get('code'), r.get('msg', ''))
time.sleep(6)

log = open('C:/Users/llxl/SiYuan/temp/gs_realtime.log', encoding='utf-8').read()
print('--- log tail ---')
print('\n'.join(log.splitlines()[-5:]))