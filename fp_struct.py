import urllib.request, re

for f in ['kernel/apicontract/network_input.go', 'kernel/api/network.go']:
    try:
        txt = urllib.request.urlopen(
            f'https://raw.githubusercontent.com/siyuan-note/siyuan/master/{f}',
            timeout=30).read().decode()
        m = re.search(r'type ForwardProxy\w* struct \{[^}]+\}', txt)
        if m:
            print(f'--- {f} ---')
            print(m.group(0)[:800])
    except Exception as e:
        print(f, 'ERR', e)