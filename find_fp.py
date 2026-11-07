import urllib.request, re

# forwardProxy 定义在别的文件。全仓库搜。
out = subprocess_run = None
import subprocess
r = subprocess.run(['gh', 'api', 'search/code?q=repo:siyuan-note/siyuan+forwardProxy+in:file+language:go',
                    '--jq', '.items[] | .path'], capture_output=True, text=True, timeout=60)
print(r.stdout)