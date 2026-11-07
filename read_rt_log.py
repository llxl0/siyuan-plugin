import urllib.request, json, time

def post14(ep, payload={}):
    req = urllib.request.Request('http://127.0.0.1:16806' + ep,
                                 data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode('utf-8', 'replace')

# getFile 对不存在的文件返回非 JSON（202/404 包装），直接原样打印
print('14u gs_realtime.log raw:')
print(post14('/api/file/getFile', {'path': '/temp/gs_realtime.log'})[:300])