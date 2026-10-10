# Verified Docker Hub manifest digests; application dependencies use lock files.
FROM node:22-bookworm-slim@sha256:efd0ab5780c2d9ab1f0f869571a00d5edb17793bff4cce4a2792e3eb0ffc7562 AS assets
ARG NPM_REGISTRY=https://registry.npmjs.org
WORKDIR /app
COPY apps/sem/package.json apps/sem/package-lock.json ./
RUN npm ci --no-audit --no-fund --registry=${NPM_REGISTRY}
COPY apps/sem/ ./
RUN npm run build

FROM composer:2@sha256:af98f42dfff7c68ba8d53c2164fd9fde1087b7d449514baa38c418b1f6bc4bac AS composer
FROM php:8.3-fpm-bookworm@sha256:61bc522867df9f96b932ddfef0be67a39cd488e8235ad68fea8b69d22e4b4135 AS runtime
ARG DEBIAN_MIRROR=https://deb.debian.org
RUN sed -i "s|http://deb.debian.org|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y --no-install-recommends \
    nginx curl unzip git gosu mariadb-client fonts-droid-fallback \
    libpng-dev libjpeg62-turbo-dev libfreetype6-dev libonig-dev \
    libxml2-dev libzip-dev libldap2-dev libicu-dev libsqlite3-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j4 pdo_mysql pdo_sqlite mbstring exif pcntl bcmath gd zip ldap soap intl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=composer /usr/bin/composer /usr/local/bin/composer
WORKDIR /app
ENV COMPOSER_ALLOW_SUPERUSER=1
COPY apps/sem/composer.json apps/sem/composer.lock ./
COPY infra/sem/composer-http1.php /tmp/composer-http1.php
ARG COMPOSER_HTTP1=0
RUN --mount=type=cache,target=/root/.composer/cache \
    export COMPOSER_CACHE_DIR=/root/.composer/cache COMPOSER_MAX_PARALLEL_HTTP=6; \
    if [ "$COMPOSER_HTTP1" = 1 ]; then export COMPOSER_PHP_FLAGS='-d auto_prepend_file=/tmp/composer-http1.php'; fi; \
    attempt=0; until php ${COMPOSER_PHP_FLAGS:-} /usr/local/bin/composer install --no-interaction --prefer-dist --no-scripts --no-autoloader; do \
      attempt=$((attempt + 1)); [ "$attempt" -lt 3 ] || exit 1; sleep 5; \
    done \
    && composer check-platform-reqs
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
COPY apps/sem/ ./
RUN composer dump-autoload --optimize --no-interaction
COPY --from=assets /app/public/build/ /app/public/build/
COPY infra/sem/ /opt/jingneng-sem/
RUN cp /opt/jingneng-sem/nginx.conf /etc/nginx/nginx.conf \
    && cp /opt/jingneng-sem/php.ini /usr/local/etc/php/conf.d/jingneng.ini \
    && chmod +x /opt/jingneng-sem/entrypoint.sh \
    && mkdir -p public/fonts \
    && cp /usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf public/fonts/jingneng-cjk.ttf \
    && cp -r vendor/almasaeed2010/adminlte/plugins/icheck-bootstrap public/vendor/icheck-bootstrap \
    && mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/app/private \
    && chown -R www-data:www-data storage bootstrap/cache
EXPOSE 8080 9000
ENTRYPOINT ["/opt/jingneng-sem/entrypoint.sh"]
CMD ["php-fpm", "-F"]
