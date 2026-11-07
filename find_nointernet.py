import subprocess

# "No internet" 文案在哪生成？在 i18n.ts 搜 key，然后找使用处
out = subprocess.run(['grep', '-n', 'No internet', 'D:/DevTools/_forks/siyuan-plugin/src/shared-utils/i18n.ts'],
                     capture_output=True, text=True)
print('i18n:', out.stdout)
out = subprocess.run(['grep', '-rn', 'no_internet', 'D:/DevTools/_forks/siyuan-plugin/src/'],
                     capture_output=True, text=True)
print(out.stdout[:600])