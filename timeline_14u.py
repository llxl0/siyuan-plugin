import json, time, urllib.request

# 关键矛盾：state.commitSha 已=f89cc50c（16 推的 ab7da8c 之后又一个），说明 pull 成功过！
# 但 12:23:12 又有 pull error。看时间线：error 是「新 ETag 轮询发现更新→尝试 pull」失败？
# 还是 error 后 state 才更新？需要完整日志 + GitHub 提交时间对照。
def post14(ep, payload={}):
    req = urllib.request.Request('http://127.0.0.1:16806' + ep,
                                 data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'replace')

log = post14('/api/file/getFile', {'path': '/temp/gs_realtime.log'})
print('=== 14u rt log 完整 ===')
print(log)

# GitHub 最新 5 提交时间
import subprocess
out = subprocess.run(['gh', 'api', 'repos/llxl0/siyuan-notes/commits',
                      '--jq', '.[0:5][] | .commit.author.date + \" | \" + .sha[0:7]'],
                     capture_output=True, text=True)
print('=== GitHub 最新 5 提交 ===')
print(out.stdout)

# 14u state 当前
print('state:', post14('/api/file/getFile',
      {'path': '/data/storage/petal/siyuan-github-sync/github-sync-state.json'})[:120])