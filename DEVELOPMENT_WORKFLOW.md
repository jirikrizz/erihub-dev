# Development Workflow & Strategy

**Účel**: Bezpečný vývoj bez ohrožení produkčních dat  
**Strategie**: Source of truth = Produkce, Dev = Safe playground

---

## 🎯 PRINCIP VÝVOJE

```
┌──────────────────┐
│   PRODUKCE       │ ← SOURCE OF TRUTH
│   (hub.kv.cz)    │   (data, running code)
└────────┬─────────┘
         │
    BACKUP DAILY
         │
         ▼
┌──────────────────┐
│   DEV LOCAL      │ ← SAFE PLAYGROUND
│   (Mac M3)       │   (testování, experimenty)
└──────────────────┘
         │
    GIT COMMIT
         │
         ▼
┌──────────────────┐
│   STAGING        │ ← TEST BEFORE PROD
│   (příprava)     │   (full integration test)
└──────────────────┘
         │
    MANUAL APPROVAL
         │
         ▼
┌──────────────────┐
│   PRODUKCE       │ ← DEPLOY
│   (hub.kv.cz)    │   (go live)
└──────────────────┘
```

---

## 📋 GIT STRATEGIE

### Branch model:

```
main                 ← PRODUKCE (always = production state)
├── develop          ← Integration branch (all features merged)
├── feature/*        ← Individual features/fixes
│   ├── feature/inventory-forecasting
│   ├── feature/customer-tagging
│   ├── fix/snapshot-retry-logic
│   └── ...
└── hotfix/*         ← Emergency fixes for production
    └── hotfix/order-sync-crash
```

### Workflow pro feature:

```bash
# 1. Start feature
git checkout develop
git pull origin develop
git checkout -b feature/my-feature

# 2. Develop (s hot reload)
# ... kod ...
# ... local testing ...

# 3. Commit + push
git add .
git commit -m "feat(module): description"
git push origin feature/my-feature

# 4. Create PR (code review)
# → GitHub PR review

# 5. Merge to develop
git checkout develop
git merge --no-ff feature/my-feature
git push origin develop

# 6. Delete feature branch
git branch -d feature/my-feature
git push origin --delete feature/my-feature

# 7. Deploy to staging (for testing)
./deploy.sh staging

# 8. Merge to main (for production)
git checkout main
git merge --no-ff develop -m "Release: v1.2.3"
git tag v1.2.3
git push origin main --tags

# 9. Deploy to production
./deploy.sh production
```

### Commit message convention:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Code style (formatting, etc)
- `refactor` - Code refactoring (no feature change)
- `perf` - Performance improvement
- `test` - Test changes
- `chore` - Build, dependencies, etc

**Scopes**:
- `core` - Core module
- `shoptet` - Shoptet module
- `pim` - PIM module
- `inventory` - Inventory module
- `customers` - Customers module
- `orders` - Orders module
- `analytics` - Analytics module
- `frontend` - React frontend

**Examples**:
```
feat(inventory): Add stock forecasting AI
fix(shoptet): Prevent duplicate snapshot processing
perf(orders): Add index to order_date column
docs(readme): Update deployment instructions
refactor(customers): Extract tagging logic to service
test(pim): Add translation workflow tests
```

---

## 💻 LOCAL DEVELOPMENT ENVIRONMENT

### Setup:

```bash
# 1. Clone repo
git clone git@github.com:jirikrizz/admin-kv.git ADMIN-KV-DEV
cd ADMIN-KV-DEV

# 2. Create .env files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Database setup (SQLite for local)
cd backend
php artisan migrate --seed  # Creates admin@example.com / secret

# 4. Run local server
php artisan serve                    # API on :8000
php artisan queue:work --queue=snapshots,default  # Queue worker

# 5. Frontend (new terminal)
cd frontend
npm install
npm run dev                          # On :5173
```

### Docker development (recommended):

```bash
# Start all services
docker compose up -d

# Or with queue workers
docker compose --profile workers up -d

# Seed database
docker compose exec backend php artisan migrate --seed

# Check logs
docker compose logs -f backend
docker compose logs -f queue
docker compose logs -f frontend
```

### Hot reload development:

```bash
# Backend (Artisan hot reload)
php artisan serve

# Frontend (Vite hot reload)
cd frontend && npm run dev

# Queue worker (restart on changes)
php artisan queue:work --queue=snapshots,default
```

---

## 🧪 TESTING STRATEGY

### Unit/Feature tests (Laravel):

```bash
# Run all tests
php artisan test

# Run specific test file
php artisan test tests/Feature/Shoptet/SnapshotTest.php

# Run specific test
php artisan test --filter=test_snapshot_processing

# With coverage
php artisan test --coverage

# Code style check
./vendor/bin/pint

# Static analysis
./vendor/bin/phpstan analyse
```

### Frontend tests:

```bash
# Linting
cd frontend && npm run lint

# (Consider adding Vitest/Jest in future)
```

### Database testing:

```bash
# Create test database
php artisan migrate --database=testing --seed

# Rollback to clean state
php artisan migrate:refresh --seed
```

---

## 📊 STAGING ENVIRONMENT

### Purpose:
- Full integration testing before production
- Test with production-like data
- Verify migrations work correctly

### Data handling:

```bash
# 1. Backup production database
./scripts/backup-prod-db.sh  # → backup-2026-01-02.sql.gz

# 2. Restore to staging
./scripts/restore-to-staging.sh backup-2026-01-02.sql.gz

# 3. Anonymize sensitive data (optional)
php artisan staging:anonymize-customers  # Remove real emails
php artisan staging:anonymize-orders     # Remove real addresses

# 4. Test on staging
# ... run manual tests ...

# 5. Approve for production
./deploy.sh production
```

**Note**: Staging should be prod-like but NOT with real customer PII

---

## 🚀 DEPLOYMENT STRATEGY

### Pre-deployment checklist:

```bash
#!/bin/bash
# Pre-deploy checklist

echo "🔍 Pre-deployment checks..."

# 1. All tests pass
php artisan test || exit 1
npm run lint || exit 1

# 2. All changes committed
git status --short
[[ -z $(git status --short) ]] || exit 1  # Fail if uncommitted changes

# 3. Latest code
git fetch origin
git diff main origin/main | head -20

# 4. Database migrations valid
php artisan migrate --dry-run  # Doesn't execute, just checks

# 5. No failing jobs in queue
docker compose exec backend php artisan queue:failed | grep -q . && echo "⚠️ Failed jobs exist" && exit 1 || true

echo "✅ All pre-deployment checks passed!"
```

### Deployment types:

#### A. Regular deployment (safe):
```bash
./deploy.sh production

# Safe because:
- Backup created automatically
- No data loss
- Can rollback easily
- No schema changes
```

#### B. Migration deployment (requires care):
```bash
# BEFORE:
1. Test migration on dev DB: php artisan migrate
2. Backup production: ./scripts/backup-prod-db.sh
3. Dry-run on production: php artisan migrate --dry-run
4. Set maintenance mode: php artisan down

# DEPLOY:
./deploy.sh production --skip-cache-clear

# AFTER:
5. Verify data integrity: php artisan db:check-integrity
6. Clear cache: php artisan cache:clear
7. Resume: php artisan up
8. Monitoring: watch logs for errors
```

#### C. Emergency hotfix:
```bash
# For critical production issues

# 1. Create hotfix branch
git checkout -b hotfix/urgent-fix

# 2. Quick fix + test
# ... code ...
php artisan test --filter=critical_test

# 3. Merge to main (skip develop)
git checkout main
git merge --no-ff hotfix/urgent-fix

# 4. Deploy immediately
./deploy.sh production

# 5. Merge back to develop
git checkout develop
git merge --no-ff hotfix/urgent-fix
```

---

## 🛡️ DATA SAFETY RULES

### TIER 1: NEVER touch without backup
```
❌ NEVER delete from orders
❌ NEVER delete from order_items
❌ NEVER delete from customers
❌ NEVER delete from products
```

**Migration example** (NEVER do this):
```php
// ❌ BAD - NEVER!
Schema::drop('orders');

// ❌ BAD - NEVER!
Order::truncate();

// ✅ GOOD - Always preserve data
Schema::table('orders', function (Blueprint $table) {
    $table->softDeletes();  // Add soft delete column
});

// ✅ Mark as deleted instead of actual deletion
$order->delete();  // Uses soft_delete
```

### TIER 2: Test migrations on local first
```bash
# 1. Create migration
php artisan make:migration add_status_to_orders

# 2. Implement migration locally
# ... edit migration file ...

# 3. Test locally
php artisan migrate
php artisan migrate:rollback
php artisan migrate

# 4. Only then push to prod
git commit -m "migration: add status to orders"
git push origin feature/...
```

### TIER 3: Always have rollback plan
```bash
# If migration fails:
1. Stop deployment
2. Restore from backup: php artisan migrate:rollback
3. Fix issue
4. Re-deploy

# If code fails:
1. git reset --hard previous_commit
2. docker compose restart backend
3. Verify health
```

---

## 📈 MONITORING & DEBUGGING

### Production monitoring:

```bash
# Check health
curl https://hub.krasnevune.cz/api/health

# Check queue status
ssh deploy@server "cd /home/deploy/admin-kv && docker compose exec backend php artisan queue:monitor"

# Check recent errors
ssh deploy@server "cd /home/deploy/admin-kv && docker compose logs --tail=100 backend | grep -i error"

# Check database health
ssh deploy@server "cd /home/deploy/admin-kv && docker compose exec postgres pg_stat_statements"
```

### Local debugging:

```bash
# Enable query logging
export LOG_CHANNEL=daily
export APP_DEBUG=true

# Check slow queries
php artisan debugbar

# Laravel Pail (real-time logs)
php artisan pail --filter=error

# Database query inspection
DB::enableQueryLog();
// ... code ...
dd(DB::getQueryLog());
```

---

## 🔄 REGULAR MAINTENANCE

### Daily:
- ✅ Check queue jobs (no failures)
- ✅ Monitor logs for errors
- ✅ Verify backups completed

### Weekly:
- ✅ Review performance metrics
- ✅ Check for slow queries
- ✅ Verify all integrations working

### Monthly:
- ✅ Database VACUUM/OPTIMIZE
- ✅ Review and clean old logs
- ✅ Update dependencies (with caution!)
- ✅ Security patches

### Quarterly:
- ✅ Database schema audit
- ✅ Performance optimization review
- ✅ Capacity planning (disk, CPU, RAM)

---

## 📚 TEAM COLLABORATION

### Code review checklist:

```markdown
## Code Review Checklist

- [ ] Code follows project conventions
- [ ] Tests added/updated
- [ ] No database schema changes without migration
- [ ] No hardcoded secrets/credentials
- [ ] Performance acceptable (no N+1 queries)
- [ ] Error handling implemented
- [ ] Documentation updated if needed
- [ ] No breaking changes (or documented)
- [ ] Backup/rollback plan if needed
```

### Communication:

1. **Before starting work**: Create GitHub issue + assign yourself
2. **During development**: Push to feature branch (visibility)
3. **When done**: Create PR with description
4. **After merge**: Leave comment with deployment status

---

## 🆘 EMERGENCY PROCEDURES

### If something breaks in production:

```bash
# IMMEDIATE (0-5 min):
1. Assess impact (users affected? data loss?)
2. Decide: rollback vs fix?

# ROLLBACK:
./rollback.sh                      # Auto rollback to previous commit
docker compose restart backend     # Restart to apply

# FIX:
1. Debug locally
2. Create fix in hotfix/* branch
3. Test thoroughly
4. Deploy with ./deploy.sh production

# POST-MORTEM:
1. What happened?
2. Why wasn't it caught in tests?
3. How prevent in future?
4. Add test case to prevent recurrence
```

### Database corruption:

```bash
# If data looks wrong:

# 1. Check backups
ls -la /home/deploy/backups/

# 2. Restore from backup
./restore-from-backup.sh backup-2026-01-02.sql.gz

# 3. Identify what went wrong
# (Investigate code/job that caused issue)

# 4. Fix code
# (Never deploy broken code again)

# 5. Restore again if needed
```

---

## 📋 SUMMARY: Development vs Production

| Aspect | Dev | Production |
|--------|-----|------------|
| Database | SQLite (local) | PostgreSQL (16) |
| Data | Fresh seeds | Real (1.4M orders!) |
| Backups | Optional | Daily required |
| Testing | All tests must pass | Full integration test |
| Deployment | Instant | Controlled, monitored |
| Rollback | Just `git reset --hard` | Restore from backup |
| Risk level | Low | VERY HIGH |
| Caution level | Normal | MAXIMUM |
