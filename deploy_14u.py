import os, shutil, subprocess, time, json

REPO = 'D:/DevTools/_forks/siyuan-plugin'
DIST = os.path.join(REPO, 'dist')

# 1. 确认 dist 里 plugin.json 是修好的（LocaleStrings）
pj = json.load(open(os.path.join(DIST, 'plugin.json'), encoding='utf-8'))
assert isinstance(pj.get('displayName'), dict), 'displayName must be LocaleStrings'
print('plugin.json ok:', pj['version'], pj['displayName']['zh_CN'])

# 2. 推到 14u 中转
subprocess.run(['adb', 'push', os.path.join(DIST, 'index.js'), '/sdcard/Download/rt_index.js'],
               capture_output=True, text=True)
subprocess.run(['adb', 'push', os.path.join(DIST, 'plugin.json'), '/sdcard/Download/rt_plugin.json'],
               capture_output=True, text=True)
subprocess.run(['adb', 'push', os.path.join(DIST, 'icon.png'), '/sdcard/Download/rt_icon.png'],
               capture_output=True, text=True)
subprocess.run(['adb', 'push', os.path.join(DIST, 'preview.png'), '/sdcard/Download/rt_preview.png'],
               capture_output=True, text=True)
print('pushed to Download')

# 3. 14u 的插件目录：/sdcard/Android/data/org.b3log.siyuan/files/siyuan/data/plugins/siyuan-github-sync
#    adb shell 无权写 -> 走 14u 内核 API（端口 16806）
def put14(remote_path, local_path):
    import urllib.request, mimetypes
    bnd = '----RT'
    with open(local_path, 'rb') as f:
        data = f.read()
    body = (f'--{bnd}\r\n'
            f'Content-Disposition: form-data; name="path"\r\n\r\n{remote_path}\r\n'
            f'--{bnd}\r\n'
            f'Content-Disposition: form-data; name="isDir"\r\n\r\nfalse\r\n'
            f'--{bnd}\r\n'
            f'Content-Disposition: form-data; name="modTime"\r\n\r\n{int(time.time()*1000)}\r\n'
            f'--{bnd}\r\n'
            f'Content-Disposition: form-data; name="file"; filename="{os.path.basename(local_path)}"\r\n'
            f'Content-Type: application/octet-stream\r\n\r\n').encode() + data + f'\r\n--{bnd}--\r\n'.encode()
    req = urllib.request.Request('http://127.0.0.1:16806/api/file/putFile', data=body,
                                 headers={'Content-Type': f'multipart/form-data; boundary={bnd}'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode()[:60]

P = 'data/plugins/siyuan-github-sync/'
for name, local in [('plugin.json', os.path.join(DIST, 'plugin.json')),
                    ('icon.png', os.path.join(DIST, 'icon.png')),
                    ('preview.png', os.path.join(DIST, 'preview.png')),
                    ('index.js', os.path.join(DIST, 'index.js'))]:
    print(f'put {name}:', put14(P + name, local))

# 4. 写配置 + state（与 16 相同 token）
old = json.load(open('C:/Users/llxl/SiYuan/data/storage/petal/GIT-SYNC-PLUGIN/plugin_config_git_sync_github.json', encoding='utf-8'))
gh_token = old.get('submit_token')
cfg = {'username': 'llxl0', 'repo': 'siyuan-notes', 'token': gh_token,
       'groqKey': '', 'showDiff': False, 'language': 'zh_CN', 'encryptionPassword': ''}
import tempfile
tmp = tempfile.mktemp(suffix='.json')
json.dump(cfg, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False)
print('cfg:', put14('data/storage/petal/siyuan-github-sync/github-sync-config.json', tmp))

out = subprocess.run(['gh', 'api', 'repos/llxl0/siyuan-notes/commits/main', '--jq', '.sha'],
                     capture_output=True, text=True)
sha = out.stdout.strip()
json.dump({'commitSha': sha, 'files': {}}, open(tmp, 'w', encoding='utf-8'))
print('state:', put14('data/storage/petal/siyuan-github-sync/github-sync-state.json', tmp))

# 5. 启用插件 + reload
import urllib.request, json as J
def post14(ep, payload):
    req = urllib.request.Request('http://127.0.0.1:16806' + ep,
                                 data=J.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode()[:80]

print('reload14:', post14('/api/ui/reloadUI', {}))
time.sleep(3)
print('reload14b:', post14('/api/ui/reloadUI', {}))