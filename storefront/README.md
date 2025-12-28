# HUB Storefront (Next.js Commerce foundation)

Data-driven microshop vybudovaný na Next.js 14 (app router) s designem inspirovaným Next.js Commerce 2.0. Storefront tahá obsah z HUBu, umí více tenantů podle hostnamu a rozhraní je připravené na Stripe Checkout.

## Rychlý start

```bash
# dependencies
npm install

# lokální vývoj
npm run dev
```

Základní URL: <http://localhost:3000>

> Pokud není nakonfigurován HUB, stránka se vykreslí s demo daty. Jakmile doplníš API URL a token, vezme si živý obsah.

## Konfigurace prostředí

Vytvoř `.env.local` a nastav alespoň:

```
HUB_API_URL=https://hub.krasnevune.cz
HUB_API_TOKEN=storefront-public-token
STRIPE_SECRET_KEY=sk_live_xxx   # volitelné – bez něj vrací checkout 503
REVALIDATION_SECRET=super-secret-revalidate
```

- `HUB_API_URL` + `HUB_API_TOKEN` míří na nový endpoint `GET /api/storefront/microshops/resolve` (viz backend změny).
- `STRIPE_SECRET_KEY` aktivuje reálný checkout přes Stripe Sessions.
- `REVALIDATION_SECRET` slouží pro webhooky – HUB po publikaci zavolá `POST /api/revalidate` a předá tajný klíč.

## Co je hotové

- **Více tenantů podle hostnamu** – požadavek si z hlaviček vybere správný microshop (doména, CNAME nebo slug).
- **Luxusní UI** – hero sekce, karty produktů, testimonials, FAQ. Vše laděné přes Tailwind a brandové proměnné.
- **Detail produktu** s galerii, markdown popisem, CTA na Stripe Checkout.
- **Serverové API** – `/api/revalidate` a `/api/checkout` (Stripe). Demo režim vrací zároveň smysluplné hlášky.
- **Fallback data** – pokud HUB není dostupný, stránka se stále vykreslí (užitečné pro pre-render a storybooky).

## Jak to propojit s HUBem

1. V backendu spusť nové migrace (`php artisan migrate`) – přidají brand, domény a stránky k microshopům.
2. Vyplň v HUBu na microshopu:
   - `locale`, `currency`, `brand` (barvy, gradienty)
   - `primary_domain` + `domains`
   - `content_schema.storefront` (hero, highlights, testimonials, FAQ) – pokud chybí, použijí se defaulty.
3. Po publikaci microshopu HUB zavolá `POST https://<storefront>/api/revalidate` se `REVALIDATION_SECRET`.
4. Pokud chceš Stripe, vlož `STRIPE_SECRET_KEY` a nastav webhook do HUBu (event `checkout.session.completed`).

## Struktura

```
storefront/
 ├─ src/app/(storefront)      # veřejné stránky (home, produkt, thanks)
 ├─ src/components/storefront # UI bloky (hero, grid, testimonials…)
 ├─ src/lib                   # klient na HUB, fallback data, markdown helpery
 └─ app/api                   # revalidate + checkout endpointy
```

## Build & deploy

```bash
npm run build
npm run start
```

Nasazení funguje out-of-the-box na Vercelu, Fly.io nebo jakémkoliv Node.js hostingu (Next.js 14). Pro produkci doporučujeme přidat `NEXT_PUBLIC_VERCEL_URL`/`APP_BASE_URL` a nastavit domény pro jednotlivé microshopy.

---

> Licence: MIT (přebírá licenci Next.js Commerce 2.0). Všechny použité komponenty jsou open-source.
