import subprocess

out = subprocess.run(['sed', '-n', '935,990p', 'D:/DevTools/_forks/siyuan-plugin/src/engine/SyncEngine.ts'],
                     capture_output=True, text=True)
print(out.stdout)