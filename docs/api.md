# Shoptet Commerce HUB API

Tato dokumentace shrnuje REST API backendu. Všechny privátní endpointy jsou vystavené pod prefixem `/api`. Autentizace probíhá pomocí Bearer tokenu (Laravel Sanctum) zasílaného v hlavičce `Authorization: Bearer <token>`.

> **Poznámka:** V seznamu níže nejsou veřejné webhooky ani systémové pomocné routy mimo `/api`.

## Obsah

- [Autentizace](#autentizace)
- [Analytics](#analytics)
- [Administrace](#administrace)
- [Inventář](#inventář)
- [Objednávky](#objednávky)
- [Zákazníci](#zákazníci)
- [PIM](#pim)
- [Nastavení](#nastavení)
- [Shoptet integrace](#shoptet-integrace)
- [Zdraví aplikace](#zdraví-aplikace)

---

## Autentizace

| Metoda | Cesta | Popis |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Přihlášení uživatele, vrací access token. |
| `POST` | `/api/auth/logout` | Odhlášení – invaliduje aktuální token. |

Request body loginu:

```json
{
  "email": "admin@example.com",
  "password": "secret"
}
```

---

## Analytics

| Metoda | Cesta | Popis |
| --- | --- | --- |
| `GET` | `/api/analytics/kpis` | Vrací klíčové metriky (objednávky, zákazníci, tržby). Podporuje filtry `from`, `to`, `shop_ids[]`. |
| `GET` | `/api/analytics/orders` | Přehled objednávek pro grafy (stejné filtry jako výše). |

> **Tip:** Dotazy mohou být náročné – omez interval (`from`, `to`) nebo sdruž `shop_ids`.

---

## Administrace

| Metoda | Cesta | Popis |
| --- | --- | --- |
| `GET` | `/api/admin/users` | Seznam uživatelů. |
| `POST` | `/api/admin/users` | Vytvoření uživatele. |
| `PATCH` | `/api/admin/users/{user}` | Úprava uživatele. |
| `DELETE` | `/api/admin/users/{user}` | Smazání uživatele. |
| `POST` | `/api/admin/users/{user}/roles` | Přiřazení rolí. |
| `GET` | `/api/admin/roles` | Seznam rolí. |
| `GET` | `/api/admin/sections` | Seznam sekcí (oprávnění). |

---

## Inventář

| Metoda | Cesta | Popis |
| --- | --- | --- |
| `GET` | `/api/inventory/overview` | Souhrn dostupnosti. |
| `GET` | `/api/inventory/low-stock` | Produkty s nízkou zásobou. |
| `GET` | `/api/inventory/variants` | Seznam variant (filtry `shop_id`, `status`, …, stránkování `page`, `per_page`). |
| `GET` | `/api/inventory/variants/{variant}` | Detail varianty. |
| `GET` | `/api/inventory/variants/{variant}/notes` | Seznam poznámek varianty. |
| `POST` | `/api/inventory/variants/{variant}/notes` | Vytvoření poznámky u varianty. |
| `PUT` | `/api/inventory/notes/{note}` | Úprava poznámky. |
| `DELETE` | `/api/inventory/notes/{note}` | Smazání poznámky. |
| `GET` | `/api/inventory/variants/export` | CSV export. |
| `POST` | `/api/inventory/variants/export` | CSV export vybraných variant (`ids[]`). |
| `GET` | `/api/inventory/variants/filters` | Doplňkové filtry. |
| `POST` | `/api/inventory/variants/{variant}/metrics/refresh` | Přepočet metrik. |
| `GET` | `/api/inventory/tags` | Přehled dostupných tagů. |
| `POST` | `/api/inventory/tags` | Vytvoření tagu. |
| `PUT` | `/api/inventory/tags/{tag}` | Úprava tagu. |
| `DELETE` | `/api/inventory/tags/{tag}` | Smazání tagu. |
| `POST` | `/api/inventory/variants/{variant}/tags` | Přiřazení tagů variantě (synchronizace). |

---

## Objednávky

| Metoda | Cesta | Popis |
| --- | --- | --- |
| `GET` | `/api/orders` | Pagovaný seznam objednávek (filtry datum, shop, stav). |
| `GET` | `/api/orders/{order}` | Detail objednávky včetně položek. |
| `GET` | `/api/orders/filters` | Seznam validních filtrů. |

---

## Zákazníci

| Metoda | Cesta | Popis |
| --- | --- | --- |
| `GET` | `/api/customers` | Pagovaný seznam zákazníků. |
| `GET` | `/api/customers/{customer}` | Detail zákazníka. |
| `PATCH` | `/api/customers/{customer}` | Úprava metadat zákazníka. |
| `POST` | `/api/customers/{customer}/notes` | Přidání interní poznámky. |
| `GET` | `/api/customers/export` | Export zákazníků do CSV. |

---

## PIM

| Metoda | Cesta | Popis |
| --- | --- | --- |
| `GET` | `/api/pim/products` | Seznam produktů (podporuje stránkování a filtry). |
| `GET` | `/api/pim/products/{product}` | Detail produktu. |
| `GET` | `/api/pim/products/{product}/translations/{locale}` | Náhled překladu. |
| `PATCH` | `/api/pim/products/{product}/translations/{locale}` | Uložení překladu. |
| `POST` | `/api/pim/products/{product}/translations/{locale}/ai-draft` | Generování AI návrhu. |
| `POST` | `/api/pim/products/{product}/translations/{locale}/submit` | Odeslání do workflow. |
| `POST` | `/api/pim/products/{product}/translations/{locale}/approve` | Schválení překladu. |
| `POST` | `/api/pim/products/{product}/translations/{locale}/reject` | Zamítnutí překladu. |
| `PATCH` | `/api/pim/products/{product}/overlays/{shop}` | Uložení overlay hodnot pro shop. |
| `PATCH` | `/api/pim/products/{product}/variants/{variant}/overlays/{shop}` | Overlay pro konkrétní variantu. |
| `GET` | `/api/pim/config/locales` | Dostupné jazyky. |
| `GET` | `/api/pim/category-mappings` | Přehled mapování kategorií. |
| `POST` | `/api/pim/category-mappings/confirm` | Schválení mapování. |
| `POST` | `/api/pim/category-mappings/reject` | Zamítnutí mapování. |
| `GET` | `/api/pim/category-mappings/tree` | Strom kategorií (Shoptet × HUB). |
| `GET` | `/api/pim/shop-category-nodes` | Strom kategorií napojených shopů. |
| `GET` | `/api/pim/tasks` | Seznam překladových úkolů. |
| `POST` | `/api/pim/tasks/{task}/assign` | Přiřazení úkolu uživateli. |
| `POST` | `/api/pim/tasks/{task}/complete` | Dokončení úkolu. |

---

## Nastavení

| Metoda | Cesta | Popis |
| --- | --- | --- |
| `GET` | `/api/settings/openai` | Získání informace o ulož. OpenAI klíči. |
| `POST` | `/api/settings/openai` | Uložení/odstranění OpenAI klíče. |
| `GET` | `/api/settings/analytics` | Aktuální nastavení analytiky. |
| `POST` | `/api/settings/analytics` | Uložení nastavení analytiky. |
| `GET` | `/api/settings/orders-status-mapping` | Mapa stavů objednávek. |
| `POST` | `/api/settings/orders-status-mapping` | Uložení mapy stavů. |
| `GET` | `/api/settings/job-schedules` | Cron-like plánovače (snapshots). |
| `POST` | `/api/settings/job-schedules` | Vytvoření plánu. |
| `PUT` | `/api/settings/job-schedules/{schedule}` | Úprava plánu. |
| `DELETE` | `/api/settings/job-schedules/{schedule}` | Smazání plánu. |

---

## Shoptet integrace

### Shopy a snapshoty

| Metoda | Cesta | Popis |
| --- | --- | --- |
| `GET` | `/api/shoptet/shops` | Seznam napojených shopů. |
| `POST` | `/api/shoptet/shops` | Vytvoření shopu (tokeny, konfigurace). |
| `GET` | `/api/shoptet/shops/{shop}` | Detail shopu. |
| `PUT` | `/api/shoptet/shops/{shop}` | Úprava shopu. |
| `DELETE` | `/api/shoptet/shops/{shop}` | Odstranění shopu. |
| `POST` | `/api/shoptet/shops/{shop}/refresh-token` | Oživení tokenu (partner/private API). |
| `POST` | `/api/shoptet/shops/{shop}/snapshots/products` | Vyžádání snapshotu produktů. |
| `POST` | `/api/shoptet/shops/{shop}/snapshots/orders` | Vyžádání snapshotu objednávek. |
| `POST` | `/api/shoptet/shops/{shop}/snapshots/customers` | Vyžádání snapshotu zákazníků. |
| `POST` | `/api/shoptet/shops/{shop}/sync/products` | Import produktů. |
| `POST` | `/api/shoptet/shops/{shop}/sync/products/{productTranslation}/push` | Push překladu do Shoptetu. |
| `POST` | `/api/shoptet/shops/{shop}/sync/orders` | Import objednávek. |
| `GET` | `/api/shoptet/shops/{shop}/webhook-jobs` | Poslední webhook joby. |
| `POST` | `/api/shoptet/shops/{shop}/webhook-jobs/{webhookJob}/download` | ruční stažení výsledku jobu. |

### Pluginy a šablony

| Metoda | Cesta | Popis |
| --- | --- | --- |
| `POST` | `/api/shoptet/plugins/generate` | Generování pluginu pomocí AI (vyžaduje `plugin_type`, `goal`, atd.). |
| `GET` | `/api/shoptet/plugins` | Seznam uložených pluginů. |
| `GET` | `/api/shoptet/plugins/{plugin}` | Detail pluginu + verze. |
| `GET` | `/api/shoptet/plugins/{plugin}/versions` | Výčet verzí pluginu. |
| `PUT` | `/api/shoptet/plugins/{plugin}` | Přejmenování pluginu. |
| `DELETE` | `/api/shoptet/plugins/{plugin}` | Odstranění pluginu vč. verzí. |
| `GET` | `/api/shoptet/plugin-versions/{version}` | Detail konkrétní verze (kód, metadata). |
| `GET` | `/api/shoptet/plugin-versions/{version}/download` | Stažení JS souboru. |
| `GET` | `/api/shoptet/plugin-templates` | Seznam šablon (systémové + vlastní). |
| `POST` | `/api/shoptet/plugin-templates` | Vytvoření šablony. |
| `GET` | `/api/shoptet/plugin-templates/{template}` | Detail šablony. |
| `PUT` | `/api/shoptet/plugin-templates/{template}` | Úprava šablony (mimo systémové). |
| `DELETE` | `/api/shoptet/plugin-templates/{template}` | Smazání (nelze u `is_system = true`). |
| `POST` | `/api/shoptet/webhooks` | Webhook endpoint přijímající notifikace ze Shoptetu (vyžaduje `token`). |

---

## Zdraví aplikace

| Metoda | Cesta | Popis |
| --- | --- | --- |
| `GET` | `/api/health` | Základní health-check endpoint (200 OK, pokud vše žije). |

---

## Odpovědi a standardy

- **Stránkování** – paginované listy vrací Laravel paginator (`data`, `links`, `meta`). Filtry `page` a `per_page` jsou obecně dostupné.
- **Chyby** – vracejí JSON:

```json
{
  "message": "Popis chyby",
  "errors": {
    "field": ["Detail" ]
  }
}
```

- **Autentizace** – všechny privátní endpointy (kromě webhooku a `auth/login`) vyžadují validní Bearer token.
- **Rate limiting** – standardní throttle Novady (není explicitně nastaveno, lze doplnit přes middleware).

> Máš-li další otázky k parametrům nebo chceš doplnit příklady requestů/response pro konkrétní cestu, dej vědět.
