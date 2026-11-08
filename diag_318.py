import json, subprocess, os, urllib.request

os.environ['MSYS_NO_PATHCONV'] = '1'
ADB = 'D:/geek/platform-tools-latest-windows/platform-tools/adb.exe'

gh_tok = subprocess.run(['gh', 'auth', 'token'], capture_output=True, text=True).stdout.strip()

def gh(url):
    req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + gh_tok,
                                               'User-Agent': 'diag'})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())

ref = gh('https://api.github.com/repos/llxl0/siyuan-notes/git/refs/heads/main')
c = gh('https://api.github.com/repos/llxl0/siyuan-notes/git/commits/' + ref['object']['sha'])
t = gh('https://api.github.com/repos/llxl0/siyuan-notes/git/trees/' + c['tree']['sha'] + '?recursive=1')
remote = {x['path'] for x in t['tree'] if x['type'] == 'blob' and x['path'].startswith('data/')}
print('remote blobs:', len(remote))

st16 = json.load(open('C:/Users/llxl/SiYuan/data/storage/petal/siyuan-github-sync/github-sync-state.json',
                      encoding='utf-8'))
local16 = set(st16.get('files', {}).keys())
print('16 ledger:', len(local16))

out = subprocess.run([ADB, '-s', 'e52055ee', 'shell',
                      'cat /sdcard/Android/data/org.b3log.siyuan/files/siyuan/data/storage/petal/siyuan-github-sync/github-sync-state.json'],
                     capture_output=True)
u14 = json.loads(out.stdout.decode('utf-8', 'replace'))
l14 = set(u14.get('files', {}).keys())
print('14u ledger:', len(l14))

missing = sorted(remote - l14)
print(f'remote-not-on-14u ({len(missing)}):')
for p in missing:
    print('  ', p)
extra = sorted(l14 - remote)
print(f'14u-has-remote-not ({len(extra)}):')
for p in extra[:10]:
    print('  ', p)