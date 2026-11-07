import re

# RealtimeEngine 用了 this.ledger.getHead?.() —— 检查 SyncStateLedger 有没有
txt = open('D:/DevTools/_forks/siyuan-plugin/src/engine/SyncStateLedger.ts', encoding='utf-8').read()
print('=== SyncStateLedger 全文（84 行内）===')
print(txt[:3000])