import re
txt = open('D:/DevTools/_forks/siyuan-plugin/node_modules/siyuan/kernel.d.ts', encoding='utf-8').read()
m = re.search(r'interface IWebSocketData[^{]*\{[^}]*\}', txt, re.S)
print(m.group(0)[:500] if m else 'not found in kernel.d.ts')
# Docs
for m2 in re.finditer(r'Docs\??:[^;\n]+', txt):
    print('Docs:', m2.group(0)[:200])