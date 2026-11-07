import re
# 全 node_modules 搜 IWebSocketData 定义
import subprocess
out = subprocess.run(['grep', '-rn', '-A6', 'interface IWebSocketData',
                      'D:/DevTools/_forks/siyuan-plugin/node_modules/'],
                     capture_output=True, text=True, timeout=60)
print(out.stdout[:800])