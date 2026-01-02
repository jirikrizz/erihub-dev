#!/bin/bash
set -e

BACKUP_DIR="${BACKUP_DIR:-/home/deploy/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Ensure backup dir exists
mkdir -p "$BACKUP_DIR"

# Generate filename with timestamp
BACKUP_FILE="$BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S).sql.gz"

echo "[$(date)] Starting database backup..."

# Perform backup
if docker compose exec -T postgres pg_dump -U admin_kv admin_kv 2>/dev/null | gzip > "$BACKUP_FILE"; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "[$(date)] Backup completed: $BACKUP_FILE ($BACKUP_SIZE)"
    
    # Verify backup integrity
    if gunzip -t "$BACKUP_FILE" 2>/dev/null; then
        echo "[$(date)] Backup verified: integrity OK"
    else
        echo "[$(date)] ERROR: Backup corrupted!" >&2
        rm -f "$BACKUP_FILE"
        exit 1
    fi
else
    echo "[$(date)] ERROR: Backup failed!" >&2
    rm -f "$BACKUP_FILE"
    exit 1
fi

# Cleanup old backups (keep last 30 days)
echo "[$(date)] Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "backup-*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "[$(date)] Backup cleanup completed"
