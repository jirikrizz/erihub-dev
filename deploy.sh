#!/bin/bash
# Safe deployment script for Shoptet Commerce HUB
# Usage: ./deploy.sh

set -e  # Exit on any error

PROD_HOST="deploy@168.119.157.199"
PROD_DIR="/home/deploy/admin-kv"
BACKUP_DIR="/home/deploy/backups"

echo "🚀 Starting deployment to hub.krasnevune.cz..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Pre-deployment checks
echo -e "${YELLOW}📋 Pre-deployment checks...${NC}"
ssh $PROD_HOST << 'EOF'
  cd /home/deploy/admin-kv
  
  # Check if there are uncommitted changes
  if [[ -n $(git status --porcelain) ]]; then
    echo "⚠️  Warning: Uncommitted changes detected on production"
    git status --short | head -20
    echo ""
  fi
  
  # Check Docker status
  if ! docker compose ps | grep -q "Up"; then
    echo "❌ Some containers are not running!"
    docker compose ps
    exit 1
  fi
  
  # Check queue status
  echo "Queue jobs in progress:"
  docker compose exec -T backend php artisan queue:monitor 2>/dev/null || echo "Queue monitoring unavailable"
  
  echo ""
  echo "✅ Pre-checks completed"
EOF

# Step 2: Database backup
echo ""
echo -e "${YELLOW}💾 Creating database backup...${NC}"
BACKUP_FILE="backup-$(date +%Y%m%d-%H%M%S).sql.gz"

ssh $PROD_HOST << EOF
  mkdir -p $BACKUP_DIR
  cd $PROD_DIR
  docker compose exec -T postgres pg_dump -U admin_kv admin_kv | gzip > $BACKUP_DIR/$BACKUP_FILE
  
  # Keep only last 30 backups
  cd $BACKUP_DIR
  ls -t backup-*.sql.gz | tail -n +31 | xargs rm -f 2>/dev/null || true
  
  echo "✅ Backup created: $BACKUP_FILE"
  echo "   Size: \$(du -h $BACKUP_DIR/$BACKUP_FILE | cut -f1)"
EOF

# Step 3: Confirmation
echo ""
echo -e "${YELLOW}⚠️  Ready to deploy. This will:${NC}"
echo "   1. Pull latest code from main branch"
echo "   2. Update dependencies (composer + npm)"
echo "   3. Run database migrations"
echo "   4. Clear caches"
echo "   5. Restart backend, nginx, and frontend services"
echo ""
read -p "Continue with deployment? (yes/no): " -r
echo ""

if [[ ! $REPLY =~ ^yes$ ]]; then
  echo "❌ Deployment cancelled"
  exit 1
fi

# Step 4: Pull code
echo -e "${YELLOW}📥 Pulling latest code...${NC}"
ssh $PROD_HOST << 'EOF'
  cd /home/deploy/admin-kv
  git fetch origin
  
  CURRENT_COMMIT=$(git rev-parse HEAD)
  REMOTE_COMMIT=$(git rev-parse origin/main)
  
  if [ "$CURRENT_COMMIT" = "$REMOTE_COMMIT" ]; then
    echo "✅ Already up to date (no new commits)"
  else
    echo "Updating from $CURRENT_COMMIT to $REMOTE_COMMIT"
    git pull origin main
    echo "✅ Code updated"
  fi
EOF

# Step 5: Update backend dependencies
echo ""
echo -e "${YELLOW}📦 Updating backend dependencies...${NC}"
ssh $PROD_HOST << 'EOF'
  cd /home/deploy/admin-kv
  docker compose exec -T backend composer install --no-dev --optimize-autoloader --no-interaction
  echo "✅ Backend dependencies updated"
EOF

# Step 6: Update frontend dependencies
echo ""
echo -e "${YELLOW}📦 Updating frontend dependencies...${NC}"
ssh $PROD_HOST << 'EOF'
  cd /home/deploy/admin-kv
  # Only if package.json changed
  if git diff --name-only HEAD@{1} HEAD | grep -q "frontend/package.json"; then
    docker compose run --rm frontend npm ci
    echo "✅ Frontend dependencies updated"
  else
    echo "⏭️  Skipping (package.json unchanged)"
  fi
EOF

# Step 7: Run migrations
echo ""
echo -e "${YELLOW}🗄️  Running database migrations...${NC}"
ssh $PROD_HOST << 'EOF'
  cd /home/deploy/admin-kv
  
  # Check for pending migrations
  PENDING=$(docker compose exec -T backend php artisan migrate:status | grep -c "Pending" || echo "0")
  
  if [ "$PENDING" -gt 0 ]; then
    echo "Found $PENDING pending migration(s)"
    docker compose exec -T backend php artisan migrate --force
    echo "✅ Migrations applied"
  else
    echo "⏭️  No pending migrations"
  fi
EOF

# Step 8: Clear caches
echo ""
echo -e "${YELLOW}🧹 Clearing caches...${NC}"
ssh $PROD_HOST << 'EOF'
  cd /home/deploy/admin-kv
  docker compose exec -T backend php artisan config:clear
  docker compose exec -T backend php artisan cache:clear
  docker compose exec -T backend php artisan view:clear
  docker compose exec -T backend php artisan route:cache
  docker compose exec -T backend php artisan config:cache
  echo "✅ Caches cleared"
EOF

# Step 9: Restart services (NOT queue workers!)
echo ""
echo -e "${YELLOW}🔄 Restarting services...${NC}"
ssh $PROD_HOST << 'EOF'
  cd /home/deploy/admin-kv
  
  # Restart only web services, NOT queue workers
  docker compose restart backend nginx frontend
  
  # Wait for services to be healthy
  sleep 5
  
  # Check if backend is responding
  if docker compose exec -T backend php artisan --version > /dev/null 2>&1; then
    echo "✅ Backend is healthy"
  else
    echo "❌ Backend is not responding!"
    exit 1
  fi
  
  echo "✅ Services restarted"
EOF

# Step 10: Post-deployment health check
echo ""
echo -e "${YELLOW}🏥 Running health checks...${NC}"
ssh $PROD_HOST << 'EOF'
  cd /home/deploy/admin-kv
  
  # Check container status
  if docker compose ps | grep -q "Exit\|unhealthy"; then
    echo "❌ Some containers are unhealthy!"
    docker compose ps
    exit 1
  fi
  
  # Check for errors in logs (last 50 lines)
  ERROR_COUNT=$(docker compose logs --tail=50 backend 2>&1 | grep -ci "error\|exception\|fatal" || echo "0")
  
  if [ "$ERROR_COUNT" -gt 5 ]; then
    echo "⚠️  Warning: Found $ERROR_COUNT errors in recent logs"
    echo "   Check logs: docker compose logs -f backend"
  else
    echo "✅ No critical errors in recent logs"
  fi
  
  # Check queue workers
  echo ""
  echo "Queue worker status:"
  docker compose ps | grep queue
  
  echo ""
  echo "✅ Health checks completed"
EOF

# Success!
echo ""
echo -e "${GREEN}✨ Deployment completed successfully!${NC}"
echo ""
echo "📊 Next steps:"
echo "   - Monitor logs: ssh $PROD_HOST 'cd $PROD_DIR && docker compose logs -f backend'"
echo "   - Check queue: ssh $PROD_HOST 'cd $PROD_DIR && docker compose logs -f queue'"
echo "   - Visit: https://hub.krasnevune.cz"
echo ""
echo "🔙 Rollback available:"
echo "   - Backup: $BACKUP_DIR/$BACKUP_FILE"
echo "   - To rollback: ./rollback.sh $BACKUP_FILE"
