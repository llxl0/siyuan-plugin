import subprocess, json, time, urllib.request

ADB = 'D:/geek/platform-tools-latest-windows/platform-tools/adb.exe'

def post14(ep, payload={}):
    req = urllib.request.Request('http://127.0.0.1:16806' + ep,
                                 data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')

# 14u 状态已到 f5bc8c4c（pull 成功！）但 12:35:59 又对 b9887f58 pull error。
# 模式清晰了：**每隔一轮 pull 就失败一次**。f5bc8c4c 成功 → b9887f58 失败。
# 因为每次 pull 后 14u 写 state → 但 siyuan 检测到 data 变更 → 内核 push_reload
# 通知插件 reload？→ reload 后 10s 内又 pull（新提交 b9887f58 已就位）→ 失败？
# 不对。看真实失败点 —— SyncError(500, "No internet") 意味着 fetch throw。
# retry 也全失败 = 40 秒内 forwardProxy 一直炸。而这与 pull 间隔耦合。
# 唯一合理解释：pull 从 GitHub 下载多个 blob（CHUNK 5 并发）时，forwardProxy
# 被内核**并发限制**拒绝 —— /api/network/forwardProxy 有并发锁，5 个并发里
# 部分 code!=0 或 fetch 失败。旧代码 throw；新代码 retry 3 次也撞锁。
# 修复：把 downloadAndWriteFiles 的 CHUNK_SIZE_PULL 降到 2，且 ghViaKernel
# 全局串行化（一个 promise 队列）。
txt = open('D:/DevTools/_forks/siyuan-plugin/src/engine/SyncEngine.ts', encoding='utf-8').read()
m = re.search(r'CHUNK_SIZE_PULL = \d+', txt)
print('当前并发:', m.group(0))
# 查 push 端 CHUNK_SIZE
m2 = re.search(r'CHUNK_SIZE = \d+', open('D:/DevTools/_forks/siyuan-plugin/src/shared-utils/types.ts', encoding='utf-8').read())
print('push 并发:', m2.group(0) if m2 else '?')