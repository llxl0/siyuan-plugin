import json, time, urllib.request, subprocess

TOK = 'ov016i4uke322wdl'

def api16(ep, payload):
    req = urllib.request.Request(
        'http://127.0.0.1:6806' + ep,
        data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json', 'Authorization': 'Token ' + TOK})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())

# E2E: write a doc via the same editor transaction path the AI uses,
# then verify: 1) realtime engine picks it up 2) push lands on GitHub.
doc = '20261105062107-uaivit3'  # "Project" notebook (formerly PA-工作笔记)
tree = api16('/api/filetree/listDocsByPath', {'notebook': doc, 'path': '/'})
print('notebook docs:', [x.get('title') for x in tree.get('data', {}).get('files', [])][:8])