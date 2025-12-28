import type { StorefrontPayload } from "./types";

export const FALLBACK_PAYLOAD: StorefrontPayload = {
  tenant: {
    id: "tenant-demo",
    slug: "demo",
    name: "Krásné Vůně Atelier",
    locale: "cs-CZ",
    currency: "CZK",
    primaryDomain: "atelier.localhost",
    domains: ["atelier.localhost", "localhost:3000"],
    brand: {
      primary: "#6F2CFF",
      secondary: "#0B112B",
      accent: "#14B8A6",
      surface: "#0F172A",
      muted: "#1E293B",
      onPrimary: "#0B1120",
      onSurface: "#F8FAFC",
      gradientFrom: "rgba(124, 58, 237, 0.65)",
      gradientTo: "rgba(8, 145, 178, 0.65)",
      fontDisplay: "Playfair Display",
      fontSans: "Inter",
    },
  },
  microsite: {
    id: "microshop-demo",
    name: "Limitovaná kolekce Atelier",
    slug: "limitovana-kolekce",
    seo: {
      title: "Limitovaná kolekce niche parfémů | Krásné Vůně Atelier",
      description:
        "Kurátorovaný výběr niche parfémů a doplňků pro tvé VIP zákazníky. Elegantní microshop připravený ke sdílení během pár minut.",
      ogImage: "https://images.unsplash.com/photo-1520962922320-2038eebab146?w=1200&q=80",
    },
  },
  products: [
    {
      id: "prod-ouroboros",
      slug: "imperial-ouroboros",
      sku: "KV-IMPERIAL-OUD",
      name: "Imperial Ouroboros",
      subtitle: "Signature blend 2025",
      excerpt: "Mystická kompozice oudového dřeva, černé ambry a sušených růží.",
      descriptionMd:
        "### Imperial Ouroboros\n\nZahal se do tajemství Orientu. V srdci tohoto parfému pulzuje kombinace **oudového dřeva**, černé ambry a sušených růží. Doznívá v něm vetiver s kakaovým máslem, který vytváří dokonalý, dlouhotrvající dojem.\n\n- koncentrace: extrait de parfum\n- výdrž: 12–14 hodin\n- původ ingrediencí: Indie, Maroko, Srí Lanka\n",
      imageUrl: "https://images.unsplash.com/photo-1556229010-6b4b7ea7f83e?w=900&q=80",
      gallery: [
        "https://images.unsplash.com/photo-1541643600914-78b084683601?w=900&q=80",
        "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=900&q=80",
      ],
      priceCents: 349000,
      priceCurrency: "CZK",
      tags: ["oud", "oriental", "signature"],
      metadata: { top_notes: ["růže", "safran"], season: "podzim" },
      available: true,
      badge: "LIMITED",
      cta: { label: "Nakoupit VIP", href: "https://atelier.localhost/cart" },
      detailUrl: "https://atelier.localhost/products/imperial-ouroboros",
    },
    {
      id: "prod-rose-noire",
      slug: "rose-noire",
      sku: "KV-ROSE-NOIRE",
      name: "Rose Noire Privée",
      subtitle: "Večerní gala",
      excerpt: "Zamatová růže s likérem z černého rybízu a sametovým santalem.",
      descriptionMd:
        "### Rose Noire Privée\n\nLimitovaná edice, která oslavuje **francouzské parfémářství**. Černá růže se proplétá s likérem z rybízu a krémovým santalem.\n\n- koncentrace: eau de parfum\n- výdrž: 8–10 hodin\n- ideální na gala večery a zimní období\n",
      imageUrl: "https://images.unsplash.com/photo-1521579971123-1192931a1452?w=900&q=80",
      gallery: [
        "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=900&q=80",
        "https://images.unsplash.com/photo-1518112166137-85f9979a43aa?w=900&q=80",
      ],
      priceCents: 289000,
      priceCurrency: "CZK",
      tags: ["floral", "evening", "limited"],
      metadata: { accords: ["rose", "blackcurrant", "sandalwood"], season: "zima" },
      available: true,
      badge: "BOUTIQUE",
      cta: { label: "Rezervovat ochutnávku", href: "#kontakt" },
    },
    {
      id: "prod-golden-hour",
      slug: "golden-hour",
      sku: "KV-GOLDEN-HOUR",
      name: "Golden Hour Elixir",
      subtitle: "Daytime ritual",
      excerpt: "Citrusové osvěžení s ambrovým dozvukem a jiskřivým šampaňským.",
      descriptionMd:
        "### Golden Hour Elixir\n\nKolekce **atelierových parfémů** inspirovaných posledními paprsky slunce. Dominují tóny šampaňského, grapefruitu a ambry.\n\n- koncentrace: eau de parfum\n- výdrž: 6–8 hodin\n- perfektní pro denní nošení\n",
      imageUrl: "https://images.unsplash.com/photo-1520681400005-6c0b6aeead4c?w=900&q=80",
      gallery: [
        "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?w=900&q=80",
        "https://images.unsplash.com/photo-1464037866556-6812c9d1c72e?w=900&q=80",
      ],
      priceCents: 319000,
      priceCurrency: "CZK",
      tags: ["citrus", "amber", "daytime"],
      metadata: { mood: "fresh", season: "léto" },
      available: true,
      badge: "NEW",
    },
  ],
  catalog: {
    hero: {
      eyebrow: "Limitovaná kolekce",
      title: "Vůně, které definuje tvůj podpis",
      description:
        "Kurátorovaný výběr niche parfémů a luxusních doplňků připravený na jediné URL. Sdílej ho s VIP zákazníky nebo publikuj na vlastní doméně během minut.",
      primaryCta: { label: "Objev kolekci", href: "#kolekce" },
      secondaryCta: { label: "Rezervovat konzultaci", href: "#kontakt" },
      media: {
        image: "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1200&q=80",
        alt: "Luxusní parfém na mramorovém podstavci",
      },
    },
    highlights: [
      {
        title: "Kurátorovaný výběr",
        description: "Každý produkt vybíráme podle dat z HUBu a preferencí tvých zákazníků.",
        icon: "Sparkles",
      },
      {
        title: "Prémiové marže",
        description: "Nastav si vlastní ceny, měny i balíčky. Microshop se o prezentaci postará.",
        icon: "Diamond",
      },
      {
        title: "Blesková publikace",
        description: "Sdílej unikátní URL nebo exportuj na vlastní doménu s napojením na Stripe Checkout.",
        icon: "Zap",
      },
    ],
    editorial: {
      title: "Rituál parfuméra",
      bodyMd:
        "Vůně je emoce. Vytvořili jsme výběr, který funguje ve vrstvách – od prvního setkání až po poslední podpis na objednávce. Microshop umožňuje tvému týmu pracovat s prémiovým materiálem bez kompromisů: **vysoké marže**, okamžité publikace a napojení na HUB data.\n\nKaždá kolekce má připravené doporučené mixy, pairingy i storytelling pro newsletter nebo sociální sítě. Díky tomu posílíš vztah se zákazníky a přitom ušetříš čas.",
    },
    testimonials: [
      {
        quote:
          "Kampaň přes microshop přinesla během prvního týdne 420 000 Kč s průměrnou objednávkou 6 800 Kč. VIP klienti milují personalizaci.",
        author: "Lucia Hrubá",
        role: "zakladatelka niche parfumérie, Praha",
      },
      {
        quote:
          "Zatímco Shoptet snapshot běžel, microshop už prodával. Přes Stripe máme zaplacené objednávky dřív než logistika otevře sklad.",
        author: "Ondřej Bystroň",
        role: "COO, KrasneVune.cz",
      },
    ],
    faqs: [
      {
        question: "Jak funguje napojení na Stripe Checkout?",
        answer:
          "Microshop odešle košík přes Stripe Checkout Sessions. Stačí vložit Stripe klíče do HUBu a objednávky se zapíšou do CRM.",
      },
      {
        question: "Můžu využít vlastní doménu?",
        answer:
          "Ano. Přidej CNAME do DNS, označ doménu jako primární a microshop se automaticky publikuje na tvém brandu.",
      },
      {
        question: "Kolik produktů microshop zvládne?",
        answer:
          "Ideální je 5–12 položek. Layout se přizpůsobí automaticky včetně variant, cen a přepočtu měny do CZK.",
      },
    ],
  },
  pages: [
    {
      path: "/katalog",
      title: "Katalog produktů",
      bodyMd:
        "Prohlédni si naši kompletní nabídku niche parfémů, doplňků a dárkových balení. Každý produkt má připravené storytelling materiály.",
      published: true,
    },
    {
      path: "/faq",
      title: "FAQ",
      bodyMd:
        "Najdeš zde odpovědi na nejčastější otázky ohledně integrace, logistiky a konfigurace microshopu.",
      published: true,
    },
  ],
  lastPublishedAt: "2025-11-01T10:45:00Z",
};

export default FALLBACK_PAYLOAD;
