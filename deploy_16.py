import json, shutil, os

REPO = 'D:/DevTools/_forks/siyuan-plugin'
DIST = os.path.join(REPO, 'dist')
TARGET = 'C:/Users/llxl/SiYuan/data/plugins/siyuan-github-sync'

# 改 plugin.json 显示名（版本号由构建流程维护，不在这里追加后缀）
pj = json.load(open(os.path.join(DIST, 'plugin.json'), encoding='utf-8'))
print('原 plugin.json:', pj.get('name'), pj.get('version'), pj.get('displayName'))
# displayName 必须是 LocaleStrings 对象（内核 bazaar.LocaleStrings），不能是字符串
pj['displayName'] = {'default': 'GitHub Sync RT', 'zh_CN': 'GitHub 同步 RT',
                     'en_US': 'GitHub Sync RT'}
if isinstance(pj.get('description'), dict):
    pj['description']['zh_CN'] = pj['description'].get('zh_CN', '') + '（llxl0 实时版：事件推送 + ETag 轮询 + 无感刷新）'
# 只写回部署副本语义，但为避免污染 dist（build 会重新生成），直接在内存里改完写 dist
# 注意：dist 的 version 由构建后步骤统一设置，这里不修改 version
json.dump(pj, open(os.path.join(DIST, 'plugin.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=2)

# 部署到 16 的插件目录（新目录，不动现用 GIT-SYNC-PLUGIN）
os.makedirs(TARGET, exist_ok=True)
for f in ['index.js', 'plugin.json', 'icon.png', 'preview.png', 'README.md']:
    src = os.path.join(DIST, f)
    if os.path.exists(src):
        shutil.copy2(src, os.path.join(TARGET, f))
        print('部署:', f, os.path.getsize(os.path.join(TARGET, f)), 'B')

# 生成 i18n 缺失检查（插件用 t() 需要 src/i18n 里的 json？看 dist 是否带）
extra = [f for f in os.listdir(DIST) if f.endswith('.json') or f.endswith('.css')]
print('dist 其他文件:', extra)