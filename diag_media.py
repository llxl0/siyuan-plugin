import json, subprocess, urllib.request

gh_tok = subprocess.run(['gh', 'auth', 'token'], capture_output=True, text=True).stdout.strip()

def gh(url):
    req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + gh_tok,
                                               'User-Agent': 'd'})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())

ref = gh('https://api.github.com/repos/llxl0/siyuan-notes/git/refs/heads/main')
c = gh('https://api.github.com/repos/llxl0/siyuan-notes/git/commits/' + ref['object']['sha'])
t = gh('https://api.github.com/repos/llxl0/siyuan-notes/git/trees/' + c['tree']['sha'] + '?recursive=1')

sy = [x for x in t['tree'] if x['path'].endswith('.sy')]
media = [x for x in t['tree'] if any(x['path'].endswith(e) for e in
         ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.docx', '.canvas'))]
msize = sum(x.get('size', 0) for x in media)
ssize = sum(x.get('size', 0) for x in sy)
print(f'.sy docs: {len(sy)} ({ssize/1048576:.1f} MB)')
print(f'media:    {len(media)} ({msize/1048576:.1f} MB)')
if media:
    big = sorted(media, key=lambda x: -x.get('size', 0))[:5]
    for x in big:
        print(f"  {x.get('size',0)/1024:.0f} KB  {x['path'][:60]}")