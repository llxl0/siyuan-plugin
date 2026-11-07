import subprocess
# IWebSocketData 的结构
out = subprocess.run(['grep', '-n', '-A8', 'interface IWebSocketData',
                      'D:/DevTools/_forks/siyuan-plugin/node_modules/siyuan/siyuan.d.ts'],
                     capture_output=True, text=True)
print(out.stdout)

# transactions payload 里 Docs 结构
out = subprocess.run(['grep', '-rn', 'transactions', 'D:/DevTools/_forks/siyuan-plugin/node_modules/siyuan/siyuan.d.ts'],
                     capture_output=True, text=True)
print(out.stdout)