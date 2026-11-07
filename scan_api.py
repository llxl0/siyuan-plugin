import urllib.request

base = 'https://raw.githubusercontent.com/llxl0/siyuan-plugin/main/'
for f in ['src/api/Siyuan-api.ts']:
    txt = urllib.request.urlopen(base + f, timeout=20).read().decode('utf-8', 'replace')
    print(f'===== {f} ({len(txt)} B) =====')
    lines = txt.splitlines()
    for i, l in enumerate(lines):
        low = l.lower()
        if any(k in low for k in ['refreshfiletree', 'rebuild', 'upsert', 'reload', 'index', 'async ']):
            print(f'{i+1}: {l.strip()[:140]}')