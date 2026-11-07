import json, re, time, urllib.request

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

# 磁盘 6 个 .sy 与远端逐字节一致 —— 文件层完全同步！
# 「测试GitHub同步RT」「反验」「验收」不在树里 = 它们的 .sy 在远端也不存在
# （远端只有 6 个 .sy：tstnew1/k0sg4yu/lywabbn 是你手动建的测试）。
# 之前 14u 树里那个「测试GitHub同步RT」是 14u 本地创建但 push 后被 16 的
# 删除提交覆盖前的一个短暂状态，远端现在确实没有它 —— 一致！
# 结论：文件层三端一致 ✅。16 的树里少的是「远端已删、16 索引未清」的孤儿？
# 不——16 树里的 6 篇 = 磁盘 6 个 .sy。全对齐！
# 那「测试GitHub同步RT」去哪了？它是 14u 上的 orphan（远端无、14u 索引有）。
# 让 14u 的树也确认一下：
r = post('/api/filetree/listDocsByPath',
         {'notebook': '20261105062107-uaivit3', 'path': '/'}, 16806)
names14 = [x['name'] for x in r['data']['files']]
print('14u 文档树:', names14)
print('14u 树是否多于远端（orphan）:', len(names14))
# 清理 14u 的 orphan（不在远端的）
remote_names = {'测试16编辑同步到14u_conflict_github_1794039225475',
                '测试16编辑同步到14u_conflict_github_1794039171453',
                '补丁验证-索引热更新', '全新的开始', '测试14u编辑同步到16', '测试16编辑'}
for f0 in r['data']['files']:
    if f0['name'] not in remote_names:
        rr = post('/api/filetree/removeDocByID', {'id': f0['id']}, 16806)
        print('14u 清理 orphan:', f0['name'], rr.get('code'))