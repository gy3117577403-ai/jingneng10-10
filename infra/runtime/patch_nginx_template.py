"""Validate browser Origin, then use a reachable internal realtime callback URL.

Frappe 16.51 authenticates sockets by fetching an HTTP endpoint on Origin.
127.0.0.1 in the websocket container is not the user's browser-facing host.
Validate the real external origin at nginx before mapping the internal pair.
Framework namespace, session and user validation remain enabled.
"""

from pathlib import Path

template = Path('/templates/nginx/frappe.conf.template')
source = template.read_text()
original = 'proxy_set_header Origin $proxy_x_forwarded_proto://${FRAPPE_SITE_NAME_HEADER};'
if source.count(original) != 1:
    raise SystemExit('Pinned upstream nginx template changed; review the Origin mapping.')
origin_map = '''# Same-origin polling may omit Origin; explicit origins must match exactly.
map $http_origin $jn_browser_origin {
    default $http_origin;
    "" "$scheme://$http_host";
}

'''
source = source.replace('\nserver {\n', '\n' + origin_map + 'server {\n', 1)
source = source.replace('location /socket.io {', '''location /socket.io {
        if ($jn_browser_origin != "$scheme://$http_host") { return 403; }''', 1)
old_headers = original + '\n\t\tproxy_set_header Host $host;'
if source.count(old_headers) != 1:
    raise SystemExit('Pinned upstream socket headers changed; review the mapping.')
source = source.replace(old_headers, '''proxy_set_header Origin http://frontend:${NGINX_LISTEN_PORT};
        proxy_set_header Host frontend:${NGINX_LISTEN_PORT};''')
template.write_text(source)
