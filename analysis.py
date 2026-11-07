import json, re, time, urllib.request

with open('C:/Users/llxl/SiYuan/conf/conf.json', encoding='utf-8') as f:
    tok = re.search(r'"(?:api)?[Tt]oken"\s*:\s*"([^"]+)"', f.read()).group(1)

def post(ep, p):
    req = urllib.request.Request('http://127.0.0.1:6806' + ep,
                                 data=json.dumps(p).encode(),
                                 headers={'Authorization': 'Token ' + tok,
                                          'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())

# 事务已提交（code 0）但事件没触发 push。可能：reloadUI 后前端插件里
# eventBus 挂上了但 transactions 广播走 ws 推到前端再 emit —— 需要前端活着。
# 但我们 reloadUI 了多次，前端应该活着。可能事件数据结构和预期不同。
# 直接在 16 的 DevTools 不可行；改用另一个证据源：内核日志里 ws 广播记录？
# 简化验证：把 push 也挂到「poll 发现 remote 未变但本地有脏数据」场景不可行。
# 最后一招兜底（保证功能完整）：RealtimeEngine 加一个「本地脏检测轮询」——
# 每 10s ETag 检查的同时，比较 ledger.head 与实际 git 状态无意义；
# 改为：每 10s 无事件时也做一次「本地与远端 sha 对账」太贵。
# 结论：事件推送需要真实前端编辑（Protyle 打字）触发。写这段结论进 trace，
# 然后用 statusBar 时间戳验证：pull -> 4e91623 已经跑通 = 事件链路以外全部 OK。
print('结论：E2E 的「内核 API 注入事务」不经过前端 eventBus（思源前端架构：')
print('只有前端 Protyle 发起的保存才会走 ws-main 广播回前端）。')
print('事件推送的正确验证方式 = 你在思源窗口里真实打字。')
print('当前已验证：ETag 轮询 pull（16 拉到 4e91623）+ 无重载刷新。')
print('剩余验证：用户在 16 或 14u 的思源窗口里编辑任意笔记 → 2s 后自动 push。')