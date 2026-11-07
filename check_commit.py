import urllib.request, json, re

with open('C:/Users/llxl/SiYuan/conf/conf.json', encoding='utf-8') as f:
    tok = re.search(r'"(?:api)?[Tt]oken"\s*:\s*"([^"]+)"', f.read()).group(1)

def get(ep, payload, port=6806, tok=None):
    h = {'Content-Type': 'application/json'}
    if tok:
        h['Authorization'] = 'Token ' + tok
    req = urllib.request.Request(f'http://127.0.0.1:{port}' + ep,
                                 data=json.dumps(payload).encode(), headers=h)
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode())

# GitHub 最新提交是谁推的？内容是什么？
import subprocess
out = subprocess.run(['gh', 'api', 'repos/llxl0/siyuan-notes/commits/4e916236',
                      '--jq', '.files[] | .status + \" \" + .filename'], capture_output=True, text=True)
print('4e916236 内容:')
print(out.stdout[:600])
out = subprocess.run(['gh', 'api', 'repos/llxl0/siyuan-notes/commits/main',
                      '--jq', '.author.login + \" | \" + .commit.author.date'], capture_output=True, text=True)
print('author:', out.stdout)

# 16 端内存使用（排查 OOM 隐患是否解决）
out = subprocess.run(['powershell', '-NoProfile', '-Command',
                      'Get-Process SiYuan* | Select-Object ProcessName, Id, @{N="MB";E={[math]::Round($_.WorkingSet64/1MB)}} | Format-Table -AutoSize'],
                     capture_output=True, text=True)
print('16 内存:')
print(out.stdout)