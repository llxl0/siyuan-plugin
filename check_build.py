import json
d = json.load(open('D:/DevTools/_forks/siyuan-plugin/package.json', encoding='utf-8'))
print('scripts:', json.dumps(d.get('scripts', {}), indent=1))
print('main:', d.get('main'))
print('webpack output 配置:')
w = open('D:/DevTools/_forks/siyuan-plugin/webpack.config.js', encoding='utf-8').read()
import re
for m in re.finditer(r'(output|path|filename)[^,]*', w):
    print(' ', m.group(0)[:100])