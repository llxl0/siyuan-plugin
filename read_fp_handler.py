import urllib.request, re

# payload 字段名是 "payload" 不是 "requestBody"！还有 headers 是数组格式没错。
# 也确认响应字段。读 network.go 的 forwardProxy handler 响应结构。
txt = urllib.request.urlopen(
    'https://raw.githubusercontent.com/siyuan-note/siyuan/master/kernel/api/network.go',
    timeout=30).read().decode()
idx = txt.find('forwardProxy')
seg = txt[idx:idx+2500]
print(seg)