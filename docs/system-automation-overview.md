# Přehled front, jobů a datových toků

## 1. Infrastruktura front a workerů
- **Front-end Redis**: Redis (docker služba `redis`) je centrální message broker pro Laravel queue.
- **Worker služby**:
  - `queue`: spouští `php artisan queue:work --queue=snapshots,default --sleep=1 --tries=3 --timeout=3600`. Obsluhuje snapshotové operace a obecné joby.
  - `queue_customers`: spouští `php artisan queue:work --queue=customers --sleep=1 --tries=3 --timeout=3600`. Je vyhrazená pro zákaznické dávky.
- **Scheduler**: služba `scheduler` každou minutu volá `php artisan job-schedules:run`, čímž vyhodnocuje plánované úlohy.

## 2. Seznam front a jobů

### Fronta `snapshots`
| Job | Spouštěč | Účel |
| --- | --- | --- |
| `Modules\\Shoptet\\Jobs\\FetchNewOrdersJob` | plán `orders.fetch_new` (JobSchedule) | Odvozuje vhodné časové okno, požádá Shoptet o snapshot a zařadí ho ke stažení. |
| `Modules\\Shoptet\\Jobs\\DownloadShoptetSnapshot` | dispatched z `FetchNewOrdersJob` nebo webhooků | Stahuje snapshot gzip, ukládá do úložiště a startuje zpracování. |
| `Modules\\Shoptet\\Jobs\\ProcessShoptetSnapshot` | dispatched po stažení snapshotu | Streamově načítá řádky, volá importéry (produkty, objednávky, zákazníci), připraví varianty na přepočet skladových metrik. |

### Fronta `customers`
| Job | Spouštěč | Účel |
| --- | --- | --- |
| `Modules\\Customers\\Jobs\\DispatchCustomerMetricsRecalculationJob` | plán `customers.recalculate_metrics` | Přenastaví stav plánu, načte volby, zařadí dávky zákaznických metrik. |
| `Modules\\Customers\\Jobs\\DispatchCustomersBackfillFromOrdersJob` | plán `customers.backfill_from_orders` | Najde objednávky bez zákazníka, připraví dávky a odešle je do fronty `customers`. |
| `Modules\\Customers\\Jobs\\RecalculateCustomerMetricsJob` | dispatch přes `CustomerMetricsDispatchService` | Přepočítá agregované metriky (počty objednávek, CLV, AOV) pro předané GUIDy zákazníků. |
| `Modules\\Customers\\Jobs\\BackfillOrdersChunkJob` | `DispatchCustomersBackfillFromOrdersJob` nebo `customers:backfill-from-orders --queue` | Zpracuje dávku objednávek a vytvoří/obohatí zákazníky dle OrderCustomerBackfillService. |

### Fronta `default`
| Job | Spouštěč | Účel |
| --- | --- | --- |
| `Modules\\Inventory\\Jobs\\RecalculateInventoryVariantMetricsJob` | spouští `ProcessShoptetSnapshot` po importu objednávek | Přepočítá skladové metriky pro varianty v dávkách po 50 kusech. |
| `Modules\\Customers\\Jobs\\AttachOrderCustomerJob` | volá `OrderSnapshotImporter` (sync) nebo `customers:sync-order-customers --queue` | Napáruje existujícího zákazníka nebo vytvoří vazbu pro objednávku. Výchozí fronta je `default`, parametr se dá přepsat. |

## 3. Plánovací katalog
`Modules\\Core\\Support\\JobScheduleCatalog` definuje dostupné plánované úlohy:
- `orders.fetch_new` – aktivní handler, pracuje inkrementálně přes REST (`orders.change_time`).
- `orders.refresh_statuses` – zatím bez handleru (plán se přeskakuje jako „unsupported“).
- `products.import_master` – aktivní handler, inkrementální import z master shopu (`products.change_time`).
- `customers.recalculate_metrics` – aktivní handler, posílá dávky do `customers` fronty.
- `customers.backfill_from_orders` – aktivní handler, páruje objednávky bez zákazníků a zakládá/obohacuje profily.

Každý záznam obsahuje defaultní cron, časové pásmo a volitelné parametry (`fallback_lookback_hours`, `queue`, `chunk`). UI (Automation Settings) čte katalog a umožňuje ovlivnit frekvenci.

## 4. Datové toky

### 4.1 Objednávky a Shoptet integrace
1. **Naplánování**: každou minutu běží `job-schedules:run`; pokud cron souhlasí, nastaví `orders.fetch_new` do stavu „queued“ a zařadí `FetchNewOrdersJob`.
2. **Inkrementální window**: job načte kurzor `orders.change_time` ze `shop_sync_cursors`, vypočítá `changeTimeFrom/To` (fallback při prvním běhu) a získá Redis lock `snapshot_lock:<shop>:orders-incremental`. Do `snapshot_executions` se zapíše průběh.
3. **REST import**: `OrderSyncService` volá `GET /api/orders` s časovým oknem, následně pro každý kód dotáhne detail `GET /api/orders/{code}`. Payload dál zpracuje `OrderSnapshotImporter` – zachovává se logika položek, měn i párování zákazníků.
4. **Kurzory & pipeline**: po úspěchu se kurzor posune na největší `changeTime`, záznam v `snapshot_executions` se označí jako `completed` a lock se uvolní. Při výjimce se status nastaví na `error`, lock se uvolní a Laravel retryne jen daný shop.
5. **Skladové metriky**: identifikátory variant z objednávek se deduplikují a dávky se posílají do `RecalculateInventoryVariantMetricsJob`.
6. **Ruční snapshoty**: endpointy `/api/shoptet/shops/{id}/snapshots/{orders|products|customers}` spouštějí Shoptet snapshot, založí záznam v `snapshot_executions` (status `queued`) a po dokončení stáhnutí/zpracování se log automaticky aktualizuje. UI (Shoptet → detail shopu) zobrazuje pipeline log včetně statusů, časů a počtů záznamů.

### 4.2 Produkty (master shop)
1. **Naplánování**: plán `products.import_master` běží typicky každou hodinu. Po vyhodnocení CRONu se spustí `ImportMasterProductsJob`.
2. **Lock & kurzor**: job načte kurzor `products.change_time` (tab. `shop_sync_cursors`), spočítá `changeTimeFrom/To` podle fallbacku a získá Redis lock `snapshot_lock:<shop>:products-incremental`. Celý průběh se sleduje v `snapshot_executions`.
3. **REST import**: `ProductSyncService` volá `GET /api/products` s časovým oknem. Pro každý GUID následně stáhne detail `GET /api/products/{guid}` (včetně variant/parametrů) a předá payload do `ProductSnapshotImporter`, takže zůstává původní logika kategorií, overlayů i variant.
4. **Kurzory & finish**: po úspěchu se kurzor posune, pipeline se označí jako `completed` a lock se uvolní. Při výjimce se pipeline označí jako `error`, lock se uvolní a Laravel retry řeší pouze daný shop.
5. **Prefill target shopů**: pokud synchronizovaný shop je master, importer stále doplňuje výchozí overlaye a mapování kategorií pro přidružené shopy.

### 4.3 Zákaznické analytiky
- **Ruční přepočet**: `php artisan customers:recalculate-metrics` umí vše spočítat synchronně nebo přes `--queue=<název>`; používá `CustomerMetricsDispatchService` a `RecalculateCustomerMetricsJob`.
- **Automatický přepočet**: plán `customers.recalculate_metrics` (např. denně ve 2:30) spouští `DispatchCustomerMetricsRecalculationJob`, který posílá dávky GUIDů do fronty `customers` a aktualizuje tabulku `customer_metrics` v transakci. Po každém běhu invaliduje cache `customers:count`.
- **Backfill & sync**: příkazy `customers:backfill-from-orders` a `customers:sync-order-customers` řeší chybějící vazby mezi objednávkami a zákazníky – podle parametrů běží synchronně nebo přes fronty.
- **Automatické doplnění profilů**: plán `customers.backfill_from_orders` pravidelně spouští backfill a posílá dávky objednávek bez zákazníka do fronty `customers`.

### 4.4 Vrstvu UI
- **API**: Backend exponuje REST API v modulech (Customers, Orders, Pim, Core). Například `Modules\Core\Http\Controllers\JobScheduleController` vrací katalog plánů včetně aktuálních běhů.
- **Frontend**: React + Vite (`frontend/`), data přes `@tanstack/react-query` (`frontend/src/api/*`). Např. `AutomationSettingsPage` načítá `/settings/job-schedules` a umožňuje konfigurovat parametry plánů.
- **Aktualizace dat**: UI se spoléhá na periodické refetchování nebo manuální akce; realtime notifikace zatím nejsou.

## 5. Struktura aplikace
- **backend/** – Laravel modulární monorepo:
  - `modules/Core` – plánování jobů, sdílené podpůrné třídy.
  - `modules/Shoptet` – integrace se Shoptetem (snapshot workflow, modely shopů).
  - `modules/Orders`, `modules/Customers`, `modules/Inventory`, `modules/Pim` – doménové importéry, metriky, API.
  - `app/Console` – Kernel, který pouští `job-schedules:run`.
- **frontend/** – SPA v Reactu, Mantine UI, requery; k backendu přistupuje přes Axios klienta.
- **docker/** – obrazy pro backend (PHP-FPM) sdílené mezi webem, workery a schedulerem.

## 6. Doporučení pro rychlejší a stabilnější zpracování
1. **Lepší paralelizace snapshotů**: rozdělit `DownloadShoptetSnapshot` a `ProcessShoptetSnapshot` na oddělené fronty (např. `snapshots-download` a `snapshots-process`) s vlastními workery; umožní kratší běhy a hladší škálování.
2. **Incrementální import**: místo kompletního přegenerování položek objednávky vždy delete+insert zvážit „upsert“ s diffem, aby snapshot processing držel ACID, ale nezatěžoval DB.
3. **Real-time notifikace**: doplnit broadcast (WebSocket / SSE) po dokončení klíčových jobů (např. metriky zákazníků), aby UI mohlo okamžitě refetchovat.
4. **Monitoring front**: přidat Horizon nebo vlastní dashboard (využívá Redis) – usnadní ladění zahlcení front a retry rate.
5. **Krátké dávky pro metriky**: snížit default `chunk` z 1000 na menší hodnotu (např. 250) a navýšit paralelní worker, aby byl recalc pružnější bez dlouhých transakcí.
6. **Aktualizace objednávek**: doplnit `orders.refresh_statuses` handler, který by periodicky kontroloval změny stavů přes API místo čekání na full snapshot.
7. **Cache invalidace do UI**: přidat event/listener, který po aktualizaci tabulek (orders/customers) invaliduje relevantní cache vrstvy nebo pustí redraw (např. přes Webhook do frontend gateway).

Tento dokument udržujme jako živý – při přidání nové fronty, jobu nebo workeru je vhodné doplnit tabulku a popis toku.
