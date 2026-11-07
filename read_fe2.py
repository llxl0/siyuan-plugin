import subprocess

out = subprocess.run(['sed', '-n', '130,165p', 'D:/DevTools/_forks/siyuan-plugin/src/shared-utils/utils.ts'],
                     capture_output=True, text=True)
print(out.stdout)