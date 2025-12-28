#!/usr/bin/env bash
set -euo pipefail

COMPOSE=${COMPOSE_BIN:-"docker compose"}
BACKEND_SERVICE=${BACKEND_SERVICE:-"backend"}
QUEUE_SERVICES=${QUEUE_SERVICES:-"queue queue_customers"}
SCHEDULER_SERVICE=${SCHEDULER_SERVICE:-"scheduler"}
REDIS_SERVICE=${REDIS_SERVICE:-"redis"}
POSTGRES_SERVICE=${POSTGRES_SERVICE:-"postgres"}

OUT_DIR=${1:-"diagnostics-$(date +%Y%m%d-%H%M%S)"}
mkdir -p "$OUT_DIR"

section () {
  echo -e "\n=== $1 ===\n" | tee -a "$OUT_DIR/run.log"
}

capture () {
  local title="$1"
  local cmd="$2"
  local file="$3"

  section "$title"
  {
    echo "\$ $cmd"
    eval "$cmd"
  } 2>&1 | tee "$OUT_DIR/$file" | tee -a "$OUT_DIR/run.log" >/dev/null
}

section "Collecting diagnostics into $OUT_DIR"

capture "docker compose ps" \
  "$COMPOSE ps" \
  "docker_ps.txt"

capture "docker compose top" \
  "$COMPOSE top $BACKEND_SERVICE $QUEUE_SERVICES $SCHEDULER_SERVICE" \
  "docker_top.txt"

stats_output="$OUT_DIR/docker_stats.txt"
section "docker stats (5s snapshot)"
{
  echo "Collecting docker stats" | tee -a "$OUT_DIR/run.log"
  : > "$stats_output"
  for svc in $BACKEND_SERVICE $QUEUE_SERVICES $SCHEDULER_SERVICE; do
    echo "\$ $COMPOSE stats --no-stream $svc" | tee -a "$OUT_DIR/run.log"
    $COMPOSE stats --no-stream "$svc" 2>&1 | tee -a "$OUT_DIR/run.log" >> "$stats_output"
  done
} >/dev/null

capture "Backend logs (last 400 lines)" \
  "$COMPOSE logs --tail 400 $BACKEND_SERVICE" \
  "backend_logs.txt"

for svc in $QUEUE_SERVICES; do
  capture "Queue logs ($svc, last 400 lines)" \
    "$COMPOSE logs --tail 400 $svc" \
    "queue_logs_${svc}.txt"
done

capture "Scheduler logs (last 200 lines)" \
  "$COMPOSE logs --tail 200 $SCHEDULER_SERVICE" \
  "scheduler_logs.txt"

capture "php artisan queue:failed" \
  "$COMPOSE exec -T $BACKEND_SERVICE php artisan queue:failed" \
  "queue_failed.txt"

capture "php artisan queue:work --queue=customers --once (dry check)" \
  "$COMPOSE exec -T $BACKEND_SERVICE php artisan queue:work --queue=customers --once --stop-when-empty" \
  "queue_once_customers.txt"

capture "php artisan horizon:list (if available)" \
  "$COMPOSE exec -T $BACKEND_SERVICE php artisan horizon:list || true" \
  "horizon_list.txt"

capture "php artisan customers:count (if command exists)" \
  "$COMPOSE exec -T $BACKEND_SERVICE php artisan customers:count || true" \
  "customers_count.txt"

capture "php artisan orders:count (if command exists)" \
  "$COMPOSE exec -T $BACKEND_SERVICE php artisan orders:count || true" \
  "orders_count.txt"

capture "redis info" \
  "$COMPOSE exec -T $REDIS_SERVICE redis-cli info | grep -E 'redis_version|used_memory_human|connected_clients|instantaneous_ops_per_sec'" \
  "redis_info.txt"

DB_USER=$(grep -E '^DB_USERNAME=' .env 2>/dev/null | tail -1 | cut -d= -f2-)
DB_NAME=$(grep -E '^DB_DATABASE=' .env 2>/dev/null | tail -1 | cut -d= -f2-)
DB_USER=${DB_USER:-postgres}
DB_NAME=${DB_NAME:-app}

capture "Long-running SQL (> 5 minutes)" \
  "$COMPOSE exec -T $POSTGRES_SERVICE psql -U \"$DB_USER\" -d \"$DB_NAME\" -c \"SELECT pid, state, now() - query_start AS runtime, query FROM pg_stat_activity WHERE state <> 'idle' AND now() - query_start > interval '5 minutes';\"" \
  "postgres_long_queries.txt"

capture "SQL locks" \
  "$COMPOSE exec -T $POSTGRES_SERVICE psql -U \"$DB_USER\" -d \"$DB_NAME\" -c \"SELECT relation::regclass AS relation, locktype, mode, granted FROM pg_locks WHERE NOT granted;\"" \
  "postgres_locks.txt"

section "Done. Diagnostics stored in $OUT_DIR"
