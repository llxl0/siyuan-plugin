import re
txt = open('D:/DevTools/_forks/siyuan-plugin/node_modules/siyuan/types.d.ts', encoding='utf-8').read()
idx = txt.find('IWebSocketData')
# 找 interface 定义
m = re.search(r'interface IWebSocketData[^{]*\{[^}]+\}', txt)
print(m.group(0) if m else 'not in types.d.ts')

# Docs 结构
m2 = re.search(r'interface IWsTransaction[^{]*\{[^}]+\}', txt)
print(m2.group(0)[:400] if m2 else '')
for m3 in re.finditer(r'Docs\??:[^;\n]*', txt):
    print('Docs:', m3.group(0)[:200])