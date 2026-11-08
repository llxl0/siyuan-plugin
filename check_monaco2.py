import base64, json, subprocess

# list upstream releases to see if any version added mobile support
r = subprocess.run(['gh', 'api', 'repos/zuoez02/siyuan-plugin-monaco-editor/releases',
                    '--jq', '.[0:5][] | .tag_name + \" | \" + (.published_at // \"?\")'],
                   capture_output=True, text=True)
print('releases:')
print(r.stdout)

# The marketplace package.json that SiYuan's market shows (bazaar repo stage)
r2 = subprocess.run(
    ['gh', 'api', 'repos/siyuan-note/bazaar/contents/stage/plugins/monaco-editor.json',
     '-H', 'Accept: application/vnd.github.raw'],
    capture_output=True)
try:
    d = json.loads(r2.stdout.decode('utf-8', errors='replace'))
    print('bazaar stage entry:')
    print('  version:', d.get('version'))
    print('  backends:', d.get('backends'))
    print('  minAppVersion:', d.get('minAppVersion'))
    print('  repoURL:', d.get('repoURL'))
except Exception as e:
    print('stage fetch failed:', e, r2.stderr[:200])