# Modular HUB Architecture Overview

## Goals
- Centralizovat prodejní data pro více Shoptet Premium e-shopů (produkty, zásoby, objednávky, zákazníci, překlady).
- Poskytnout modulární administrační rozhraní, kde je překladový PIM pouze jedním z modulů.
- Synchronizovat data se Shoptet API (viz `openapi (2).json`) a zpracovávat snapshoty z asynchronních jobů.
- Nabídnout jednotné řízení přístupů, rolí a připojených kanálů.

## High-Level Components
1. **Backend API (Laravel 12)**
   - Modularizované balíčky `modules/Core`, `modules/Pim`, `modules/Shoptet`, `modules/Inventory`, `modules/Orders`, `modules/Customers`, `modules/Analytics`, `modules/Admin`.
   - REST API zabezpečené přes Laravel Sanctum.
   - Queue worker (Redis/database) pro importy, překlady a zpracování snapshotů z webhooků.

2. **Frontend Administration (React + Vite)**
   - Mantine UI + TanStack Query + Zustand.
   - Sekce: Dashboard, Inventář, Objednávky, Překlady, Úkoly, Analytika, Zákazníci, Uživatelé, Shoptet.
   - Přihlášení proti `/api/auth/login`, token perzistentní v localStorage.

3. **Infrastructure (lokální start)**
   - `.env.example` pro backend i frontend, SQLite výchozí úložiště.
   - Docker Compose (TODO) pro PHP-FPM, Nginx, PostgreSQL/Redis.
   - CI pipeline (TODO) – lint/test/build.

## Module Responsibilities

### Core (`modules/Core`)
- Auth, role management, základní routes (`/api/health`, login/logout).

### Shoptet (`modules/Shoptet`)
- Evidence shopů (`shops`, `shop_tokens`) včetně režimu API (`premium|private|partner`), webhook token/secret.
- API klient (`Http/ShoptetClient`) pro produkty, snapshoty, `/api/system/jobs`.
- Endpointy `/api/shoptet/shops` (CRUD, označení master shopu), `/api/shoptet/webhooks` (příjem jobů), `/api/shoptet/shops/{id}/snapshots/{products|orders|customers}` (vyvolání snapshotu).
- Queue joby `DownloadShoptetSnapshot` + `ProcessShoptetSnapshot` (uložení gzip, parsování JSONL).

### PIM (`modules/Pim`)
- Databáze produktů a překladů, workflow `draft → in_review → approved → synced`.
- Snapshot importer (`Services/ProductSnapshotImporter`) naplňuje `products`, `product_variants`, `product_translations`.

### Inventory (`modules/Inventory`)
- `/api/inventory/overview` a `/api/inventory/low-stock` čtou `product_variants` (zásoby, min. zásoby).

### Orders (`modules/Orders`)
- Snapshot importer (`Services/OrderSnapshotImporter`) ukládá objednávky (`orders`, `order_items`).
- REST `/api/orders` (list/detail) pro administraci.

### Customers (`modules/Customers`)
- Snapshot importer (`Services/CustomerSnapshotImporter`) ukládá `customers`, `customer_accounts`.
- REST `/api/customers` + detail.

### Analytics (`modules/Analytics`)
- `/api/analytics/kpis` – základní KPI (počet produktů, stažené/failed snapshoty).

### Admin (`modules/Admin`)
- `/api/admin/users`, `/api/admin/users/{id}/roles` – správa uživatelů/rolí (`spatie/laravel-permission`).

## Data Model (výběr)
- `shops`: id, name, domain, api_mode, default_locale, timezone, webhook_token, webhook_secret, settings (json).
- `shop_tokens`: access/refresh tokeny, expiry.
- `shoptet_webhook_jobs`: id (uuid), shop_id, job_id, event, status, endpoint, result_url, valid_until, payload (json), meta (json), snapshot_path, processed_at.
- `products`, `product_variants`, `product_translations`, `translation_tasks` – viz PIM modul.
- `orders`, `order_items` – snapshot výsledky objednávek.
- `customers`, `customer_accounts` – snapshot výsledky zákazníků.

## Synchronization & Webhooks
1. **Snapshot request** – `POST /api/shoptet/shops/{id}/snapshots/{products|orders|customers}` vyvolá Shoptet `/api/.../snapshot` a uloží job (`status=requested`).
2. **Webhook `job:finished`** – endpoint `/api/shoptet/webhooks/{shopId}` (zpětně kompatibilně i s `?token=`) ověří HMAC podpis (`Shoptet-Webhook-Signature`), získá `/api/system/jobs/{jobId}`, uloží `resultUrl` a spustí `DownloadShoptetSnapshot`.
3. **Stahování & parsování** – stáhne se `.jsonl.gz` (`storage/app/shoptet/{shop}/snapshots/...`), job `ProcessShoptetSnapshot` projde JSON Lines a upsertuje produkty/varianty, objednávky a zákazníky.
4. **UI** – sekce Inventář, Objednávky a Zákazníci čtou z lokální DB; sekce Shoptet zobrazuje historii jobů, endpoint, počty záznamů, chyby.

> Fronty: `default` (API/obsluha), `snapshots` (download + parsing). Queue worker spouštěj např. `php artisan queue:work --queue=snapshots,default`.

## Frontend Routes & Screens
- `/dashboard` – KPI (lze rozšířit o snapshot metriky).
- `/inventory` – tabulka variant s nízkými zásobami, search.
- `/orders` – paginovaný seznam objednávek (kód, zákazník, stav, cena).
- `/products`, `/products/:id` – překladový PIM editor.
- `/tasks` – (todo) workflow překladatelů.
- `/analytics` – základní metriky.
- `/customers` – přehled zákazníků a účtů.
- `/users` – správa interních uživatelů/rolí.
- `/settings/shops` – seznam shopů, kopie webhook tokenu, spouštění snapshotů, historie jobů.

## Implemented API Surface
- Auth: `POST /api/auth/login`, `POST /api/auth/logout`
- PIM: `GET /api/pim/config/locales`, `GET /api/pim/products`, `GET /api/pim/products/{id}`, `GET|PATCH /api/pim/products/{id}/translations/{locale}`, `POST /api/pim/products/{id}/translations/{locale}/{submit|approve|reject}`
- Shoptet: `GET|POST /api/shoptet/shops`, `PUT /api/shoptet/shops/{id}`, `POST /api/shoptet/shops/{id}/refresh-token`,
  `GET /api/shoptet/shops/{id}/webhook-jobs`,
  `POST /api/shoptet/shops/{id}/snapshots/{products|orders|customers}`,
  `POST /api/shoptet/shops/{id}/sync/products`, `POST /api/shoptet/shops/{shop}/sync/products/{translation}/push`,
  `POST /api/shoptet/webhooks?token=...`
- Inventář: `GET /api/inventory/overview`, `GET /api/inventory/low-stock`
- Objednávky: `GET /api/orders`, `GET /api/orders/{order}`
- Zákazníci: `GET /api/customers`, `GET /api/customers/{customer}`
- Analytika: `GET /api/analytics/kpis`
- Admin: `GET|POST /api/admin/users`, `POST /api/admin/users/{id}/roles`

## Next Steps
- Rozšířit parsování snapshotů o další sekce (`include=images`, parametry variant, dopravci).
- Validovat webhook pomocí `signatureKey` (`webhook_secret`) a hlavičky `Shoptet-Webhook-Signature`.
- Přidat plánované spouštění snapshotů + notifikace o chybách.
- Doplnit BI/E2E testy, docker-compose a CI pipeline.

## Microsites Module

Microsites allow privileged administrators to curate lightweight storefronts that reuse HUB catalogue data.

- **Data model**: `microsites` (metadata + content schema), `microsite_products` (selected product variants with overrides and snapshots) and `microsite_publications` (publish & export jobs).
- **Backend**: CRUD endpoints at `/api/microsites` guarded by `microsites.manage`. Publish/export requests enqueue jobs into the `microsites` queue, processed by `MicrositePublishJob` / `MicrositeExportJob` with a placeholder `MicrositeBuilderService`.
- **Frontend**: Admin UI is available in the new Microshopy section. The listing page allows creation, publication toggles and removal; the editor page provides a scaffold for configuring hero content, SEO metadata and product list.
- **Public rendering**: `/microsites/{slug}` currently renders a basic Blade view using stored snapshots. Future iterations will hydrate an SSG bundle and CDN deployment.

Queue workers should include the `microsites` queue in process manager definitions (e.g. `queue:work --queue=microsites,customers,default`).
