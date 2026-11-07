import re, os

base = 'D:/DevTools/_forks/siyuan-plugin/node_modules/siyuan/'
for f in os.listdir(base):
    if f.endswith('.d.ts'):
        print(f)

txt = open(base + 'siyuan.d.ts', encoding='utf-8').read()
# IWebSocketData 可能在同文件的 types 区
for m in re.finditer(r'IWebSocketData', txt):
    s = m.start()
    seg = txt[s:s+400]
    if '{' in seg:
        print(seg[:400])
        print('---')