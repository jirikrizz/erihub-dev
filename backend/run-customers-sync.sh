#!/usr/bin/env bash
php artisan customers:sync-order-customers --chunk=500 "$@"
