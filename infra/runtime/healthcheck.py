import os
import urllib.request

request = urllib.request.Request(
    'http://127.0.0.1:8000/api/method/ping',
    headers={'Host': os.environ.get('SITE_NAME', 'jingneng.localhost')},
)
with urllib.request.urlopen(request, timeout=3) as response:
    if response.status != 200:
        raise SystemExit(1)
