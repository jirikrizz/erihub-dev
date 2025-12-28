# Shoptet Commerce HUB

Modulární administrační platforma pro správu produktů, zásob, objednávek, zákazníků, překladů a napojení Shoptet Premium e-shopů. Backend běží na Laravelu (více modulů), frontend na Reactu s Mantine UI.

## Struktura repozitáře

- `backend/` – Laravel 12 API (moduly Core, Pim, Shoptet, Inventory, Orders, Customers, Analytics, Admin).
- `frontend/` – React + Vite SPA administrace.
- `docs/` – architektura a poznámky.
- `openapi (2).json` – Shoptet OpenAPI specifikace.
- `webhook.php` – původní PHP webhook (Laravel jej nahrazuje, soubor je ponechaný pro referenci).

## Požadavky

- PHP >= 8.2 + Composer
- Node.js >= 18 + npm
- SQLite (výchozí) nebo PostgreSQL/MySQL
- Queue backend (database/Redis) pro asynchronní joby (doporučené fronty: `default`, `snapshots`)

## Backend (Laravel)

1. Konfigurace prostředí:
   ```bash
   cp backend/.env.example backend/.env
   ```
2. Instalace závislostí:
   ```bash
   composer install
   ```
3. Migrace + seed (vytvoří admin účet `admin@example.com` / `secret` a role):
   ```bash
   php artisan migrate --seed
   ```
4. Lokální běh:
   ```bash
   php artisan serve            # API → http://localhost:8000
   php artisan queue:work --queue=snapshots,default
   ```
5. Import produktů ze Shoptetu (pro počáteční naplnění PIM):
   ```bash
   php artisan shoptet:import-products {shop_id} --since="2024-01-01T00:00:00Z"
   ```

### Moduly
- `Modules/Core` – autentizace, role, health endpointy.
- `Modules/Pim` – PIM/Překlady (produkty, varianty, workflow, push překladů).
- `Modules/Shoptet` – evidence shopů, API klient, správa snapshotů, webhook `/api/shoptet/webhooks?token=...`.
- `Modules/Inventory` – agregace skladových variant (tabulka `product_variants`, low-stock přehled).
- `Modules/Orders` – databáze objednávek + položek, REST API `/api/orders`.
- `Modules/Customers` – databáze zákazníků a účtů, REST API `/api/customers`.
- `Modules/Analytics` – KPI (počet produktů, variant, úspěšné/failed snapshoty).
- `Modules/Admin` – správa uživatelů/rolí (`spatie/laravel-permission`).

### Snapshot pipeline
1. Backend endpointy `/api/shoptet/shops/{id}/snapshots/{products|orders|customers}` vyvolají Shoptet snapshot (GET `/api/.../snapshot`).
2. Po obdržení webhooku `job:finished` se uloží job (`shoptet_webhook_jobs`), stáhne se `resultUrl` a gzip (`storage/app/shoptet/{shop}/snapshots/...`).
3. Job `ProcessShoptetSnapshot` rozparsuje JSON Lines a upsertuje produkty/varianty, objednávky, zákazníky.
4. UI (sekce Shoptet) ukazuje historii jobů – endpoint, stav, počet zpracovaných záznamů.

> Poznámka: queue worker musí obsluhovat i frontu `snapshots` (`php artisan queue:work --queue=snapshots,default`).

### Testy
```bash
php artisan test
```

## Docker setup

Pro běh celé platformy v kontejnerech je připraven `docker-compose.yml`, který spouští Postgres 16, Redis 7, PHP-FPM (Laravel API), frontend (Vite) a queue worker. Konfigurace je připravená pro zpracování velkých objemů objednávek a zákazníků.

1. Připrav prostředí – v repu jsou připravené soubory `backend/.env.docker` a `frontend/.env.docker`, případně si je zkopíruj na vlastní varianty.
   - Vite respektuje proměnnou `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS`, takže pro přístup přes doménu přidej např. `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=hub.krasnevune.cz`.
2. Instalace závislostí uvnitř kontejnerů:
   ```bash
   docker compose run --rm backend composer install
   docker compose run --rm frontend npm install
   ```
3. Vytvoř a naplň databázi:
   ```bash
   docker compose up -d postgres redis
   docker compose run --rm backend php artisan migrate --seed
   ```
4. Spusť všechny služby:
   ```bash
   docker compose up -d
   ```
   - API poběží na `http://localhost:8080` (nginx + PHP-FPM).
   - Frontend na `http://localhost:5173` (Vite, `VITE_API_URL` míří na `http://localhost:8080/api`).
   - Queue worker běží ve vlastním kontejneru (`queue`) nad Redisem.

> Tip: pokud potřebuješ řešit práva souborů, nastav při spouštění `UID` / `GID` proměnné (např. `UID=$(id -u) GID=$(id -g) docker compose up`) – výchozí hodnota je 1000.

> Nasazení na server (bez reverzní proxy): spusť `FRONTEND_ENV=production FRONTEND_PORT=80 docker compose up -d` a `frontend/.env.production` nastav na veřejnou adresu API (`VITE_API_URL=https://tvoje-domena/api`). K doméně, ze které chceš frontend servírovat, přidej i `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS`.

### HTTPS přes Caddy

Repo obsahuje reverzní proxy (`docker/caddy/Caddyfile`), která ukazuje `/api` na interní nginx (Laravel) a zbytek na frontend. Pro získání Let’s Encrypt certifikátu nastav v `.env` serveru:
```bash
FRONTEND_ENV=production
FRONTEND_PORT=5173          # port 80 nech na Caddy
ACME_EMAIL=admin@tvoje-domena.cz
```
Poté spusť všechny služby včetně Caddy:
```bash
docker compose up -d
```
Caddy vystaví HTTPS na portech 80/443 a požadavky z `hub.krasnevune.cz` přesměruje na správné kontejnery. Ověříš např. příkazem `curl -I https://hub.krasnevune.cz`.

## Frontend (React + Mantine)

1. Env soubor pro API endpointy:
   ```bash
   cp frontend/.env.example frontend/.env
   ```
2. Instalace a spuštění:
   ```bash
   cd frontend
   npm install
   npm run dev      # http://localhost:5173
   ```
3. Produkční build:
   ```bash
   npm run build
   ```

## Přihlašovací údaje
- Admin účet: `admin@example.com` / `secret`
- Roles: `admin`, `translator`, `viewer` (správa v sekci *Uživatelé*).

## Shoptet integrace
- V UI (Settings → Shoptet) lze spravovat Premium tokeny a spouštět snapshoty (produkty/objednávky/zákazníci). Webhook URL se generuje automaticky.
- Webhook registrujeme na `https://{tvoje-app}/api/shoptet/webhooks/{shopId}` a podpis ověřujeme přes hlavičku `Shoptet-Webhook-Signature` (HMAC‑SHA1 se `signatureKey`).
- Stáhnuté snapshoty jsou v `storage/app/shoptet/{shop_id}/snapshots/…`.
- Inventář/Objednávky/Zákazníci v administraci pracují s daty naparsovanými ze snapshotů (varianty včetně zásob, objednávkové položky, zákaznické účty).

## Další kroky
- Doplnit parsování dalších Shoptet snapshotů (např. produkty s obrázky `include=images`).
- Validovat podpis webhooku (`signatureKey` + `Shoptet-Webhook-Signature`).
- Přidat plánovač snapshotů + notifikace (Slack/e-mail) při chybě.
- Připravit docker-compose/CI pipeline a E2E testy.

Více detailů: `docs/architecture.md`.
