import re
txt = open('D:/DevTools/_forks/siyuan-plugin/node_modules/siyuan/siyuan.d.ts', encoding='utf-8').read()
idx = txt.find('IWebSocketData')
print(txt[idx-100:idx+600])