import subprocess

out = subprocess.run(['grep', '-rn', 'no_internet', 'D:/DevTools/_forks/siyuan-plugin/src/'],
                     capture_output=True, text=True)
print(out.stdout)
# 看上下文
out = subprocess.run(['grep', '-B8', '-A3', 'error.no_internet', 'D:/DevTools/_forks/siyuan-plugin/src/engine/SyncEngine.ts'],
                     capture_output=True, text=True)
print(out.stdout[:900])