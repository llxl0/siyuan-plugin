import urllib.request

# 取 transaction.go 第 2190-2215 行上下文，看 payload 结构
req = urllib.request.Request(
    'https://raw.githubusercontent.com/siyuan-note/siyuan/master/kernel/model/transaction.go')
txt = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'replace')
lines = txt.splitlines()
for i in range(2190, 2212):
    print(f'{i+1}: {lines[i]}')