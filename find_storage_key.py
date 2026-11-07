import json, time, urllib.request

# 给新插件写入 16 的配置（从旧插件移植），然后重启前端让 RealtimeEngine 跑起来
with open('C:/Users/llxl/SiYuan/conf/conf.json', encoding='utf-8') as f:
    tok = re.search(r'"(?:api)?[Tt]oken"\s*:\s*"([^"]+)"', f.read()).group(1)

import re

def post(ep, payload):
    req = urllib.request.Request('http://127.0.0.1:6806' + ep,
                                 data=json.dumps(payload).encode(),
                                 headers={'Authorization': 'Token ' + tok,
                                          'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())

# 读旧插件配置拿 token
old = json.load(open('C:/Users/llxl/SiYuan/data/storage/petal/GIT-SYNC-PLUGIN/plugin_config_git_sync_github.json', encoding='utf-8'))
gh_token = old.get('submit_token')

# 新插件的 STORAGE_KEY 是什么？看 types.ts
import subprocess
out = subprocess.run(['grep', '-n', 'STORAGE_KEY', 'D:/DevTools/_forks/siyuan-plugin/src/shared-utils/types.ts'],
                     capture_output=True, text=True)
print('STORAGE_KEY:', out.stdout.strip())
out = subprocess.run(['grep', '-n', '-A3', 'export const STORAGE_KEY', 'D:/DevTools/_forks/siyuan-plugin/src/shared-utils/types.ts'],
                     capture_output=True, text=True)
print(out.stdout)