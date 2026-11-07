import subprocess

out = subprocess.run(['sed', '-n', '135,165p', 'D:/DevTools/_forks/siyuan-plugin/src/shared-utils/utils.ts'],
                     capture_output=True, text=True)
print(out.stdout)