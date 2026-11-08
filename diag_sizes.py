import json, subprocess, urllib.request

gh_tok = subprocess.run(['gh', 'auth', 'token'], capture_output=True, text=True).stdout.strip()

def gh(url):
    req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + gh_tok,
                                               'User-Agent': 'd'})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())

ref = gh('https://api.github.com/repos/llxl0/siyuan-notes/git/refs/heads/main')
c = gh('https://api.github.com/repos/llxl0/siyuan-notes/git/commits/' + ref['object']['sha'])
t = gh('https://api.github.com/repos/llxl0/siyuan-notes/git/trees/' + c['tree']['sha'] + '?recursive=1')
for x in t['tree']:
    p = x.get('path', '')
    if '20261108013205' in p or p in ('data/assets/Pasted image 20261026020021.png',
                                      'data/assets/Pasted image 20261105042629.png'):
        print(x.get('size'), 'bytes |', p[:72])