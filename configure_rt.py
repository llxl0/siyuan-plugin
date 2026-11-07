import json, re, time, urllib.request

def post(ep, payload):
    with open('C:/Users/llxl/SiYuan/conf/conf.json', encoding='utf-8') as f:
        tok = re.search(r'"(?:api)?[Tt]oken"\s*:\s*"([^"]+)"', f.read()).group(1)
    req = urllib.request.Request('http://127.0.0.1:6806' + ep,
                                 data=json.dumps(payload).encode(),
                                 headers={'Authorization': 'Token ' + tok,
                                          'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())

# 1. 从旧插件读 token
old = json.load(open('C:/Users/llxl/SiYuan/data/storage/petal/GIT-SYNC-PLUGIN/plugin_config_git_sync_github.json', encoding='utf-8'))
gh_token = old.get('submit_token')

# 2. 写新插件配置（saveData 落在 data/storage/petal/<pkg>/github-sync-config.json）
cfg = {
    'username': 'llxl0',
    'repo': 'siyuan-notes',
    'token': gh_token,
    'groqKey': '',
    'showDiff': False,
    'language': 'zh_CN',
    'encryptionPassword': '',
}
path = 'C:/Users/llxl/SiYuan/data/storage/petal/siyuan-github-sync/github-sync-config.json'
import os
os.makedirs(os.path.dirname(path), exist_ok=True)
json.dump(cfg, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('配置写入:', path)

# 3. 写 SyncStateLedger 的初始状态（指向当前远端 HEAD，避免首轮全量）
head = subprocess = None
import subprocess
out = subprocess.run(['gh', 'api', 'repos/llxl0/siyuan-notes/commits/main',
                      '--jq', '.sha'], capture_output=True, text=True)
sha = out.stdout.strip()
print('远端 HEAD:', sha[:10])

state_path = 'C:/Users/llxl/SiYuan/data/storage/petal/siyuan-github-sync/sync-state.json'
# SYNCED_STATE_KEY 查一下
out = subprocess.run(['grep', '-n', 'SYNCED_STATE_KEY', 'D:/DevTools/_forks/siyuan-plugin/src/shared-utils/types.ts'],
                     capture_output=True, text=True)
print(out.stdout)
# files 状态先留空：首轮 pull 会用三方合并对账（local==remote 时只记账不下载）
json.dump({'commitSha': sha, 'files': {}}, open(state_path, 'w', encoding='utf-8'))
print('state 写入:', state_path)

# 4. reloadUI 生效
print('reloadUI:', post('/api/ui/reloadUI', {}).get('code'))
time.sleep(3)
print('reloadUI2:', post('/api/ui/reloadUI', {}).get('code'))