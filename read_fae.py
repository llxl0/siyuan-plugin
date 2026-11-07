import subprocess

# formatApiError 定义
out = subprocess.run(['grep', '-n', '-A20', 'private formatApiError\\|formatApiError(e:',
                      'D:/DevTools/_forks/siyuan-plugin/src/engine/SyncEngine.ts'],
                     capture_output=True, text=True)
print(out.stdout[:1100])