#!/bin/bash
set -e

# Deploy script: upload only the modified embed.blade.php to production
# and clear Laravel caches

DEPLOY_USER="deploy"
DEPLOY_HOST="168.119.157.199"
DEPLOY_PATH="admin-kv"
SOURCE_FILE="backend/modules/Pim/Resources/views/widgets/embed.blade.php"
TARGET_PATH="${DEPLOY_PATH}/backend/modules/Pim/Resources/views/widgets/"

echo "=== Action Price Deploy Script ==="
echo "Source: $SOURCE_FILE"
echo "Target: $DEPLOY_USER@$DEPLOY_HOST:$TARGET_PATH"
echo ""

# Step 1: Backup original file on server
echo "[1/4] Backing up original file on production..."
ssh -q "${DEPLOY_USER}@${DEPLOY_HOST}" <<EOF
  set -e
  BACKUP_FILE="${TARGET_PATH}embed.blade.php.backup.$(date +%Y%m%d_%H%M%S)"
  if [ -f "${TARGET_PATH}embed.blade.php" ]; then
    cp "${TARGET_PATH}embed.blade.php" "\${BACKUP_FILE}"
    echo "  ✓ Backup created: \${BACKUP_FILE}"
  else
    echo "  ⚠ Original file not found"
  fi
EOF

# Step 2: Upload modified file
echo "[2/4] Uploading modified embed.blade.php..."
rsync -avz --progress \
  "${SOURCE_FILE}" \
  "${DEPLOY_USER}@${DEPLOY_HOST}:${TARGET_PATH}"
echo "  ✓ File uploaded"

# Step 3: Clear ONLY view cache (NO migrations, NO DB access)
echo "[3/4] Clearing Laravel view cache only..."
ssh -q "${DEPLOY_USER}@${DEPLOY_HOST}" <<EOF
  set -e
  cd ${DEPLOY_PATH}
  docker compose exec -T backend php artisan view:clear
  echo "  ✓ View cache cleared (no DB operations)"
EOF

# Step 4: Verify
echo "[4/4] Verifying deployment..."
ssh -q "${DEPLOY_USER}@${DEPLOY_HOST}" <<EOF
  DEPLOYED_FILE="${TARGET_PATH}embed.blade.php"
  if [ -f "\${DEPLOYED_FILE}" ]; then
    echo "  ✓ File exists on server"
    echo "  ✓ MD5: \$(md5sum \${DEPLOYED_FILE} | awk '{print \$1}')"
  else
    echo "  ✗ File verification FAILED"
    exit 1
  fi
EOF

echo ""
echo "=== Deployment Complete ==="
echo "✓ Action price widget template deployed to production"
echo "✓ View cache cleared (NO database changes)"
echo ""
echo "IMPORTANT: No database operations were performed"
echo "- Data structure unchanged"
echo "- No migrations run"
echo "- Only view template and cache affected"
echo ""
echo "Next steps:"
echo "1. Visit https://hub.krasnevune.cz in browser"
echo "2. Open product detail page"
echo "3. Verify action prices display correctly in recommendation blocks"
echo ""
echo "Rollback (if needed - DB safe):"
echo "  ssh ${DEPLOY_USER}@${DEPLOY_HOST} 'cd ${DEPLOY_PATH} && git checkout backend/modules/Pim/Resources/views/widgets/embed.blade.php && docker compose exec -T backend php artisan view:clear'"
