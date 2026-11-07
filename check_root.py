import re
txt = open('D:/DevTools/_forks/siyuan-plugin/src/shared-utils/types.ts', encoding='utf-8').read()
# SYNC_ROOT 和 SKIP_ROOT_DIRS 的定义
for pat in ['SYNC_ROOT', 'SKIP_ROOT_DIRS', 'SKIP_PATH_FRAGMENTS']:
    for m in re.finditer(r'export const ' + pat + r'[^\n]*(?:\n[^\n]*){0,8}', txt):
        print(m.group(0)[:400])
        print('---')