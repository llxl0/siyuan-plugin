import urllib.request, re

# Transaction 结构体 + IWebSocketData 前端接收结构。关键：前端 eventBus 的 ws-main
# 收到的 CustomEvent.detail 是整个 IWebSocketData（cmd/data/msg）。
# 我们要过滤 cmd=="transactions"。另外看 Transaction 是否带文档路径。
req = urllib.request.Request(
    'https://raw.githubusercontent.com/siyuan-note/siyuan/master/kernel/model/transaction.go')
txt = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'replace')
m = re.search(r'type Transaction struct \{[^}]+\}', txt)
print(m.group(0)[:500] if m else 'Transaction struct not found')
m2 = re.search(r'type Operation struct \{[^}]+\}', txt)
print(m2.group(0)[:600] if m2 else 'Operation struct not found')