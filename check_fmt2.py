import subprocess

out = subprocess.run(['grep', '-n', '-B2', '-A15', 'formatApiError',
                      'D:/DevTools/_forks/siyuan-plugin/src/engine/SyncEngine.ts'],
                     capture_output=True, text=True)
print(out.stdout[:1500])