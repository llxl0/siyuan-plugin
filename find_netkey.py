import subprocess

# 找 i18n key 名，再找使用点
out = subprocess.run(['grep', '-B3', 'No internet', 'D:/DevTools/_forks/siyuan-plugin/src/shared-utils/i18n.ts'],
                     capture_output=True, text=True)
print(out.stdout)
out = subprocess.run(['grep', '-rn', 'no_internet\\|noInternet\\|network', 'D:/DevTools/_forks/siyuan-plugin/src/api/Github-api.ts'],
                     capture_output=True, text=True)
print(out.stdout[:800])