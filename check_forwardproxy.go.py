import subprocess

# 12:40:43 pull error 在 v5 部署后 30 秒内发生 —— 但注意：这个 reload 是 12:40:32，
# error 12:40:43。可能是旧 JS 还在跑（reload 后插件重新 onload，但 fetch 的
# 是新 bundle？deploy_16 先覆盖 16 端，14u 是 deploy_14u.py 里 putFile 覆盖。
# reload14b 在 put 之后。所以 12:40:32 realtime start 是新代码。
# 新代码的 pull error 依然 "No internet"，且没有 retry 后成功的迹象。
# 但 ghViaKernel 里 fetch("/api/network/forwardProxy") 怎么会 throw？
# —— 思源 forwardProxy 的 headers 参数格式！我用了数组 [{k:v}]，
# 官方 API 要求 { "Key": "Value" } 对象或 [{key,value}]？查内核 API 定义。
import urllib.request, json

req = urllib.request.Request(
    'https://raw.githubusercontent.com/siyuan-note/siyuan/master/kernel/api/network.go')
txt = urllib.request.urlopen(req, timeout=30).read().decode()
import re
m = re.search(r'type ForwardProxyParam struct \{[^}]+\}', txt)
print(m.group(0) if m else 'not found')
m2 = re.search(r'type ForwardProxyHeader struct \{[^}]+\}', txt)
print(m2.group(0) if m2 else 'no header struct')