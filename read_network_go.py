import urllib.request

txt = urllib.request.urlopen(
    'https://raw.githubusercontent.com/siyuan-note/siyuan/master/kernel/api/network.go',
    timeout=30).read().decode()
print(txt[:2500])