import json, os, shutil

# 我写错了 state 文件名，正确的 key 是 github-sync-state.json
old_path = 'C:/Users/llxl/SiYuan/data/storage/petal/siyuan-github-sync/sync-state.json'
new_path = 'C:/Users/llxl/SiYuan/data/storage/petal/siyuan-github-sync/github-sync-state.json'
if os.path.exists(old_path):
    shutil.move(old_path, new_path)
    print('renamed ->', new_path)

# 顺便确认新插件目录内容
d = 'C:/Users/llxl/SiYuan/data/storage/petal/siyuan-github-sync'
for f in os.listdir(d):
    print(' ', f, os.path.getsize(os.path.join(d, f)), 'B')