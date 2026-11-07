import subprocess

# 思源内核广播的事务事件是 cmd="transaction"（单数）且带 transactions 数组。
# 真实结构需要实测。先在 16 端用 eventBus 探测脚本不可行（插件内），改用文档：
# 官方插件示例（siyuan-plugin-sample）里怎么用 ws-main
out = subprocess.run(['grep', '-rn', '-B2', '-A10', "ws-main",
                      'D:/DevTools/_forks/siyuan-plugin/node_modules/siyuan/types/index.d.ts'],
                     capture_output=True, text=True, timeout=30)
print(out.stdout[:600])

# 思源源码 kernel/model/transaction.go 广播什么 cmd —— 查 GitHub
out = subprocess.run(['gh', 'api', 'search/code?q=repo:siyuan-note/siyuan+%22cmd+%22+transaction',
                      '--jq', '.items[] | .path'], capture_output=True, text=True, timeout=60)
print('code search:', out.stdout[:300])