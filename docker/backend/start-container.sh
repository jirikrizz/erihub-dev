#!/usr/bin/env bash
set -euo pipefail

cd /var/www

# Ensure storage directories exist
mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache

export PATH="/usr/local/sbin:/usr/local/bin:${PATH}"

if [ ! -f vendor/autoload.php ]; then
  composer install --no-interaction --prefer-dist
fi

if [ "$#" -gt 0 ] && [ "$1" = "php-fpm" ]; then
  shift
  exec /usr/local/sbin/php-fpm "$@"
fi

exec "$@"
