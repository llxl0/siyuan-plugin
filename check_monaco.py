import json, subprocess

# Fetch the marketplace-listed plugin.json raw (Accept header avoids base64)
r = subprocess.run(
    ['gh', 'api', 'repos/zuoez02/siyuan-plugin-monaco-editor/contents/plugin.json',
     '-H', 'Accept: application/vnd.github.raw'],
    capture_output=True)  # bytes - avoid console GBK mangling
raw = r.stdout.decode('utf-8', errors='replace')
d = json.loads(raw)
print('upstream latest:')
print('  version:', d.get('version'))
print('  backends:', d.get('backends'))
print('  minAppVersion:', d.get('minAppVersion'))

# Compare with the version installed on 16
d16 = json.load(open('C:/Users/llxl/SiYuan/data/plugins/monaco-editor/plugin.json', encoding='utf-8'))
print('installed on 16:')
print('  version:', d16.get('version'))
print('  backends:', d16.get('backends'))
print('  minAppVersion:', d16.get('minAppVersion'))