import re

# error 指向 formatApiError —— 是 Github-api 里对非 2xx 的包装。
# "No internet" i18n 由 friendlyError 产生，但这里 formatApiError 抛的
# GitHubError message 含 status/body。body 里如果含 "network"（GitHub API
# 偶发返回 failed_to_connect？）也会匹配。真正要看 formatApiError 的逻辑。
txt = open('D:/DevTools/_forks/siyuan-plugin/src/api/Github-api.ts', encoding='utf-8').read()
idx = txt.find('formatApiError')
print(txt[idx-200:idx+900])