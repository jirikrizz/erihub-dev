# Deployment Workflow & Development Strategy

## 🚨 Aktuální situace (2. ledna 2026)

### Problém: Dva oddělené repozitáře
- **Produkce** (`hub.krasnevune.cz`): `git@github.com:jirikrizz/admin-kv.git`
- **Lokální dev**: `git@github.com:jirikrizz/erihub-dev.git`

### Stav produkce
- ✅ Běží v Dockeru s PostgreSQL databází (plná produkčních dat)
- ⚠️ **153+ modified souborů** (uncommitted změny)
- ⚠️ **Mnoho untracked nových features**:
  - `Microsites` modul (kompletní)
  - `WooCommerce` integrace
  - AI generování obsahu (`ai_generations` tabulka)
  - Inventory purchase orders
  - Customer tagging system
  - Export feed linky
  - Product widgets

## 🎯 Doporučený workflow

### Fáze 1: Záchrana produkčního kódu (PRIORITA!)

```bash
# Na produkci
ssh deploy@168.119.157.199
cd /home/deploy/admin-kv

# 1. Vytvoř backup branch PŘED jakýmkoliv commitem
git checkout -b backup/pre-sync-2026-01-02
git add .
git commit -m "Backup: Production state before sync (2026-01-02)"

# 2. Pushnout backup
git push origin backup/pre-sync-2026-01-02

# 3. Vrátit se na main a commitnout vše
git checkout main
git add .
git commit -m "Production features: Microsites, WooCommerce, AI, Inventory enhancements"
git push origin main

# 4. Vytvořit tag pro tento milestone
git tag production-snapshot-2026-01-02
git push origin production-snapshot-2026-01-02
```

### Fáze 2: Synchronizace s lokálním dev

Máš 3 možnosti:

#### Možnost A: Sloučit repozitáře (DOPORUČENO)
```bash
# Na lokálním dev
cd /Users/jkriz/Desktop/ADMIN-KV-DEV

# Přidat produkční repo jako remote
git remote add production git@github.com:jirikrizz/admin-kv.git
git fetch production

# Slou čit historii (možná bude potřeba resolve conflicts)
git merge production/main --allow-unrelated-histories

# Nebo rebase (pokud chceš čistší historii)
git rebase production/main
```

#### Možnost B: Přejít na produkční repo
```bash
# Změnit origin na produkční
git remote remove origin
git remote add origin git@github.com:jirikrizz/admin-kv.git
git fetch origin
git reset --hard origin/main  # POZOR: ztratíš lokální změny!
```

#### Možnost C: Klonovat produkci znovu
```bash
cd /Users/jkriz/Desktop
git clone git@github.com:jirikrizz/admin-kv.git ADMIN-KV-PRODUCTION
# Pak merge tvé lokální změny ručně
```

### Fáze 3: Nastavení development workflow

```bash
# Struktura branchí
main              # Vždy = produkce
├── develop       # Vývojová branch
├── feature/*     # Nové features
└── hotfix/*      # Kritické opravy pro produkci

# Vývojový cyklus
git checkout -b feature/nova-funkcionalita
# ... vývoj ...
git commit -m "feat: Popis změny"
git push origin feature/nova-funkcionalita

# Po review -> merge do develop
git checkout develop
git merge feature/nova-funkcionalita

# Testování na dev serveru
# Pak merge do main a deploy
```

### Fáze 4: Automatizace deploymentu

Vytvoř skript pro bezpečný deploy:

```bash
#!/bin/bash
# deploy.sh

set -e  # Exit on error

echo "🚀 Deploying to production..."

# 1. Backup databáze
ssh deploy@168.119.157.199 << 'EOF'
  cd /home/deploy/admin-kv
  docker compose exec -T postgres pg_dump -U admin_kv admin_kv | gzip > backup-$(date +%Y%m%d-%H%M%S).sql.gz
  echo "✅ Database backed up"
EOF

# 2. Pull změny
ssh deploy@168.119.157.199 << 'EOF'
  cd /home/deploy/admin-kv
  git fetch origin
  git status
  
  read -p "Continue with deployment? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    git pull origin main
    echo "✅ Code updated"
  else
    echo "❌ Deployment cancelled"
    exit 1
  fi
EOF

# 3. Update dependencies
ssh deploy@168.119.157.199 << 'EOF'
  cd /home/deploy/admin-kv
  docker compose exec -T backend composer install --no-dev --optimize-autoloader
  docker compose run --rm frontend npm ci
  echo "✅ Dependencies updated"
EOF

# 4. Migrace (BEZ --seed!)
ssh deploy@168.119.157.199 << 'EOF'
  cd /home/deploy/admin-kv
  docker compose exec -T backend php artisan migrate --force
  echo "✅ Database migrated"
EOF

# 5. Cache clear
ssh deploy@168.119.157.199 << 'EOF'
  cd /home/deploy/admin-kv
  docker compose exec -T backend php artisan config:clear
  docker compose exec -T backend php artisan cache:clear
  docker compose exec -T backend php artisan view:clear
  echo "✅ Cache cleared"
EOF

# 6. Restart služeb (bez queue workers - aby nedošlo k přerušení dlouhých jobů)
ssh deploy@168.119.157.199 << 'EOF'
  cd /home/deploy/admin-kv
  docker compose restart backend nginx frontend
  echo "✅ Services restarted"
EOF

echo "✨ Deployment complete!"
```

## 🔒 Bezpečnostní pravidla

### NIKDY:
- ❌ `php artisan migrate:fresh` na produkci
- ❌ `php artisan db:seed` na produkci (pokud není explicitně potřeba)
- ❌ `git reset --hard` bez zálohy
- ❌ Mazat volume `postgres_data`
- ❌ Restartovat queue workers během zpracování velkých snapshotů

### VŽDY:
- ✅ Backup databáze před deploy
- ✅ Test migrací na lokálu PŘED produkčním nasazením
- ✅ Commit a push změn před testem
- ✅ Kontroluj logy po deploymentu: `docker compose logs -f --tail=100`
- ✅ Monitoruj queue workers: `docker compose exec backend php artisan queue:monitor`

## 📊 Databázové backupy

### Automatický backup (doporučeno přidat do cronu)
```bash
# Na produkci - crontab -e
0 2 * * * cd /home/deploy/admin-kv && docker compose exec -T postgres pg_dump -U admin_kv admin_kv | gzip > /home/deploy/backups/db-$(date +\%Y\%m\%d).sql.gz

# Cleanup starých backupů (starších než 30 dní)
0 3 * * * find /home/deploy/backups -name "db-*.sql.gz" -mtime +30 -delete
```

### Ruční backup před velkými změnami
```bash
ssh deploy@168.119.157.199 "cd /home/deploy/admin-kv && docker compose exec -T postgres pg_dump -U admin_kv admin_kv" | gzip > local-backup-$(date +%Y%m%d-%H%M%S).sql.gz
```

### Obnovení z backupu (EMERGENCY)
```bash
# 1. Stop aplikaci
docker compose stop backend queue queue_customers queue_orders queue_microsites queue_inventory_recommendations

# 2. Restore databáze
gunzip -c backup.sql.gz | docker compose exec -T postgres psql -U admin_kv admin_kv

# 3. Start aplikace
docker compose up -d
```

## 🔧 Development best practices

### Lokální vývoj
```bash
# 1. Vždy pull nejnovější změny
git pull origin main

# 2. Vytvoř feature branch
git checkout -b feature/my-feature

# 3. Vývoj s hot reload
cd backend && php artisan serve &
cd frontend && npm run dev

# 4. Test před commitem
cd backend && php artisan test
cd frontend && npm run lint

# 5. Commit s konvencí
git commit -m "feat(module): description"
# Types: feat, fix, docs, style, refactor, test, chore
```

### Docker development
```bash
# Full stack s hot reload
docker compose up -d
docker compose --profile workers up -d  # když potřebuješ queue workers

# Logy
docker compose logs -f backend
docker compose logs -f queue

# Exec do containeru
docker compose exec backend bash
docker compose exec postgres psql -U admin_kv
```

## 📋 Checklist před každým deploymentem

- [ ] Backup databáze proveden
- [ ] Lokální testy prošly (`php artisan test`)
- [ ] Migrace otestovány na dev DB
- [ ] Frontend build úspěšný (`npm run build`)
- [ ] Změny commitnuté a pushnuté
- [ ] Code review dokončen (pokud pracuješ v týmu)
- [ ] Queue workers ve stabilním stavu (žádné failing jobs)
- [ ] Monitoring zapnutý (sleduj chyby po deploymentu)
- [ ] Rollback plán připraven

## 🚦 Rollback postup

Pokud deploy selže:

```bash
# 1. Rychlý rollback kódu
ssh deploy@168.119.157.199 << 'EOF'
  cd /home/deploy/admin-kv
  git log --oneline -5  # Zjisti hash předchozího commitu
  git reset --hard <previous-commit-hash>
  docker compose restart backend nginx frontend
EOF

# 2. Pokud byla migrace - restore DB
# (použij postup výše)

# 3. Zkontroluj logy
ssh deploy@168.119.157.199 "cd /home/deploy/admin-kv && docker compose logs -f --tail=200 backend"
```

## 🎓 Git commit konvence

```
feat(module): Krátký popis změny
^--^ ^----^   ^-----------------^
│    │        │
│    │        └─⫸ Popis v přítomném čase
│    │
│    └─⫸ Modul: pim, shoptet, inventory, customers, etc.
│
└─⫸ Type: feat, fix, docs, style, refactor, test, chore, perf
```

Příklady:
- `feat(inventory): Add purchase order import from StockGuard`
- `fix(shoptet): Prevent duplicate snapshot processing`
- `perf(pim): Optimize product translation queries`
- `refactor(customers): Extract tag rules into service`
