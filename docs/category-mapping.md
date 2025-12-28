# Category Mapping Design

## Objectives
- Maintain one canonical category tree based on the master Shoptet shop.
- Store per-shop category trees so differences between locales can be reconciled.
- Allow automatic or manual mapping between canonical nodes and local shop categories.
- Expose data so product imports can pre-fill categories/filters for non-master shops without touching live shops.

## Data Model
### shop_category_nodes
- `id` (UUID, primary key)
- `shop_id` (FK → `shops.id`)
- `parent_id` (nullable UUID, self FK)
- `parent_guid` (nullable string; raw GUID from Shoptet)
- `remote_guid` (string, unique per shop)
- `remote_id` (nullable string)
- `name` (string)
- `slug` (nullable string)
- `position` (unsigned integer)
- `path` (nullable string; canonicalized breadcrumb for quick lookup)
- `data` (JSON)
- timestamps

### category_mappings
- `id` (UUID, primary key)
- `category_node_id` (FK → `category_nodes.id`)
- `shop_id` (FK → `shops.id`)
- `shop_category_node_id` (FK → `shop_category_nodes.id`)
- `status` (string; e.g. `suggested`, `confirmed`, `rejected`)
- `confidence` (nullable decimal)
- `source` (string; `auto` vs `manual`)
- `notes` (nullable text)
- timestamps

Constraints:
- Unique (`shop_id`, `shop_category_node_id`).
- Unique (`shop_id`, `category_node_id`) to prevent double mapping per shop.

## Synchronisation Flow
1. **Snapshot import**
   - For any shop (master or locale) parse categories from product payload.
   - Upsert into `shop_category_nodes` while maintaining parent relationships.
   - Keep original payload in `data` for future heuristics.

2. **Canonical tree maintenance**
   - Master shop categories keep populating `category_nodes` + `category_localizations` (existing flow).
   - If new canonical nodes appear, create `category_localizations` entry for master shop.

3. **Mapping heuristics**
   - When a non-master node shares GUID with master, auto-confirm mapping.
   - Otherwise compare `slug`, `name`, and breadcrumb path to suggest mappings (`status = suggested`).
   - Manual confirmation updates status to `confirmed` (through API/GUI later).

4. **Product import usage**
   - When product arrives from master, resolve canonical category IDs.
   - For each target shop mapping, fetch `shop_category_node_id`, use stored payload inside overlays to pre-fill categories/filters.

5. **No live write requirement**
   - All mapping data lives in HUB database; pushing to real Shoptet shops remains manual/explicit.

## API Outline
- `GET /api/pim/category-mappings?shop_id=...` → current mapping coverage, statuses, suggestions.
- `POST /api/pim/category-mappings/confirm` → mark mapping as confirmed.
- `POST /api/pim/category-mappings/reject` → mark suggestion as rejected.
- `GET /api/pim/category-trees` → return canonical tree + per-shop nodes (with pagination/search).

## Implementation Steps
1. Add migrations + models (`ShopCategoryNode`, `CategoryMapping`).
2. Extend `CategorySyncService` to populate `shop_category_nodes` for any shop, keeping existing canonical sync for master.
3. Implement `CategoryMappingService` with basic heuristics (match by GUID/slug + path) and store suggestions.
4. Update `ProductSnapshotImporter` to resolve canonical categories for overlays using mappings.
5. Introduce API endpoints for listing/updating mappings and wire to frontend later.

## Backlog (Prioritised)
1. **Schema layer** – migrations for `shop_category_nodes` + `category_mappings`, Eloquent models, factories, basic tests.
2. **Sync services** – update `CategorySyncService` (or new `ShopCategorySyncService`) to populate schema for any shop, including parent linkage + path hydration.
3. **Mapping heuristics** – implement `CategoryMappingService` with GUID/slug/path matching, seed suggestions during sync, add unit tests.
4. **Product pipeline integration** – enrich `ProductSnapshotImporter` to resolve canonical categories using confirmed mappings and persist to overlays.
5. **API surface** – expose REST endpoints for listing trees/mappings and updating statuses; wire to frontend iteratively.
6. **UX tooling** – admin UI for reviewing suggestions, manual confirmation, bulk operations.
7. **Job orchestration** – background jobs to rescore suggestions after manual changes and to backfill existing products.
