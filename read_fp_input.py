import urllib.request, re

txt = urllib.request.urlopen(
    'https://raw.githubusercontent.com/siyuan-note/siyuan/master/kernel/apicontract/network_input.go',
    timeout=30).read().decode()
print(txt[:1800])