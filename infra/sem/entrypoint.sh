#!/bin/sh
set -eu
cd /app
mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/app/public storage/app/private storage/fonts storage/logs
# Upstream uploads into several public directories; keep all in one backed-up volume.
for path in drawing file photo inspection-documents pdf sgv stl images/factory images/methods images/quotes-lines images/quote-lines images/orders-lines images/order-lines images/products images/ressources; do
    mkdir -p "storage/uploads/$path" "public/$(dirname "$path")"
    if [ ! -L "public/$path" ]; then
        if [ -d "public/$path" ]; then
            cp -an "public/$path/." "storage/uploads/$path/"
            mv "public/$path" "public/${path}.image-seed"
        fi
        ln -s "/app/storage/uploads/$path" "public/$path"
    fi
done
if [ ! -e public/storage ]; then ln -s /app/storage/app/public public/storage; fi
chown -R www-data:www-data storage bootstrap/cache
case "$1" in
    php|sh) exec gosu www-data "$@" ;;
esac
exec "$@"
