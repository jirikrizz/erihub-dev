<?php

namespace Modules\Microsites\Support;

use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use Modules\Microsites\Models\Microsite;
use Modules\Microsites\Models\MicrositePage;
use Modules\Microsites\Models\MicrositeProduct;

class StorefrontPayloadBuilder
{
    public function build(Microsite $microsite): array
    {
        $microsite->loadMissing([
            'products' => function ($query) {
                $query->orderBy('position');
            },
            'pages',
        ]);

        $schema = $microsite->content_schema ?? [];
        $storefront = Arr::get($schema, 'storefront', []);

        $brand = array_merge($this->defaultBrand(), $this->filterAssoc($microsite->brand ?? []));

        $tenant = [
            'id' => $microsite->id,
            'slug' => $microsite->slug,
            'name' => $microsite->name,
            'locale' => $microsite->locale ?? 'cs-CZ',
            'currency' => $microsite->currency ?? 'CZK',
            'primaryDomain' => $microsite->primary_domain,
            'domains' => $this->resolveDomains($microsite),
            'brand' => $brand,
        ];

        $products = $microsite->products->map(fn (MicrositeProduct $product) => $this->formatProduct($product, $tenant))->values()->all();

        $catalog = [
            'hero' => $this->resolveHero($storefront, $schema),
            'highlights' => $this->resolveHighlights($storefront),
            'editorial' => $this->resolveEditorial($storefront),
            'testimonials' => $this->resolveTestimonials($storefront),
            'faqs' => $this->resolveFaqs($storefront),
        ];

        $pages = $microsite->pages
            ->map(fn (MicrositePage $page) => [
                'path' => $page->path,
                'title' => $page->title,
                'bodyMd' => $page->body_md,
                'heroImage' => Arr::get($page->metadata, 'hero_image'),
                'published' => (bool) $page->published,
            ])
            ->values()
            ->all();

        $theme = $this->resolveTheme($schema, $microsite);
        $sections = $this->resolveSections($schema, $catalog);
        $header = $this->resolveHeader($schema, $microsite, $pages);
        $footer = $this->resolveFooter($schema);

        return [
            'tenant' => $tenant,
            'microsite' => [
                'id' => $microsite->id,
                'name' => $microsite->name,
                'slug' => $microsite->slug,
                'seo' => $microsite->seo,
            ],
            'products' => $products,
            'catalog' => $catalog,
            'pages' => $pages,
            'builder' => $this->extractBuilderPayload($microsite),
            'theme' => $theme,
            'sections' => $sections,
            'header' => $header,
            'footer' => $footer,
            'lastPublishedAt' => Arr::get($microsite->settings, 'publication.generated_at'),
        ];
    }

    /**
     * @return array<string, string>
     */
    private function defaultBrand(): array
    {
        return [
            'primary' => '#6F2CFF',
            'secondary' => '#0B112B',
            'accent' => '#14B8A6',
            'surface' => '#0F172A',
            'muted' => '#1E293B',
            'onPrimary' => '#0B1120',
            'onSurface' => '#F8FAFC',
            'gradientFrom' => 'rgba(124, 58, 237, 0.65)',
            'gradientTo' => 'rgba(8, 145, 178, 0.65)',
        ];
    }

    private function resolveHero(array $storefront, array $schema): array
    {
        $hero = Arr::get($storefront, 'hero', []);

        if ($hero === []) {
            $hero = Arr::get($schema, 'hero', []);
        }

        return array_merge($this->defaultHero(), $this->filterAssoc($hero));
    }

    private function resolveHighlights(array $storefront): array
    {
        $highlights = Arr::get($storefront, 'highlights', []);

        if (! is_array($highlights) || $highlights === []) {
            return $this->defaultHighlights();
        }

        return array_values(array_map(function ($item) {
            return [
                'title' => Arr::get($item, 'title', 'Kurátorovaný výběr'),
                'subtitle' => Arr::get($item, 'subtitle'),
                'description' => Arr::get($item, 'description', 'Doplň popis zvýrazněné hodnoty v HUBu.'),
                'icon' => Arr::get($item, 'icon'),
            ];
        }, $highlights));
    }

    private function resolveEditorial(array $storefront): ?array
    {
        $editorial = Arr::get($storefront, 'editorial');

        if (! is_array($editorial)) {
            return $this->defaultEditorial();
        }

        if (! Arr::get($editorial, 'title')) {
            return null;
        }

        return [
            'title' => Arr::get($editorial, 'title'),
            'bodyMd' => Arr::get($editorial, 'body_md') ?? Arr::get($editorial, 'bodyMd') ?? '',
        ];
    }

    private function resolveTestimonials(array $storefront): array
    {
        $testimonials = Arr::get($storefront, 'testimonials', []);

        if (! is_array($testimonials) || $testimonials === []) {
            return $this->defaultTestimonials();
        }

        return array_values(array_map(function ($item) {
            return [
                'quote' => Arr::get($item, 'quote', ''),
                'author' => Arr::get($item, 'author', ''),
                'role' => Arr::get($item, 'role'),
            ];
        }, $testimonials));
    }

    private function resolveFaqs(array $storefront): array
    {
        $faqs = Arr::get($storefront, 'faqs', []);

        if (! is_array($faqs) || $faqs === []) {
            return $this->defaultFaqs();
        }

        return array_values(array_map(function ($item) {
            return [
                'question' => Arr::get($item, 'question', ''),
                'answer' => Arr::get($item, 'answer', ''),
            ];
        }, $faqs));
    }

    private function extractBuilderPayload(Microsite $microsite): ?array
    {
        $builder = Arr::get($microsite->content_schema, 'builder');

        if (! is_array($builder) || ! array_key_exists('html', $builder) || trim((string) ($builder['html'] ?? '')) === '') {
            return null;
        }

        return [
            'html' => (string) ($builder['html'] ?? ''),
            'css' => (string) ($builder['css'] ?? ''),
            'components' => $builder['components'] ?? null,
            'styles' => $builder['styles'] ?? null,
        ];
    }

    private function formatProduct(MicrositeProduct $product, array $tenant): array
    {
        $snapshot = $product->snapshot ?? [];
        $overlay = $this->normalizeOverlay($product->overlay ?? null);

        $overlayPrice = $this->resolveOverlayPrice($overlay);
        $priceCents = $overlayPrice['priceCents'] ?? null;
        $priceCurrency = $overlayPrice['currency'];

        if ($priceCents === null) {
            $priceCents = $product->price_cents;
        }

        if ($priceCents === null && $product->custom_price !== null) {
            $priceCents = (int) round((float) $product->custom_price * 100);
        }

        if ($priceCents === null && isset($snapshot['price'])) {
            $priceCents = (int) round((float) $snapshot['price'] * 100);
        }

        $snapshotGallery = $this->resolveSnapshotGallery($snapshot);
        $overlayGallery = $this->resolveOverlayGallery($overlay);
        $gallery = $overlayGallery !== [] ? $overlayGallery : $snapshotGallery;

        $overlayImage = $this->stringValue(
            Arr::get($overlay, 'image_url')
                ?? Arr::get($overlay, 'image')
                ?? Arr::get($overlay, 'media.image')
        );

        $imageUrl = $overlayImage
            ?? $product->image_url
            ?? ($gallery[0] ?? null);

        $name =
            $this->stringValue(Arr::get($overlay, 'title'))
            ?? $this->stringValue(Arr::get($overlay, 'title_html'))
            ?? $product->name
            ?? $product->custom_label
            ?? Arr::get($snapshot, 'name', 'Produkt');

        $subtitle = $this->stringValue(Arr::get($overlay, 'subtitle'));

        $excerpt =
            $this->stringValue(Arr::get($overlay, 'description'))
            ?? $product->custom_description
            ?? Arr::get($snapshot, 'description');

        $tags = $this->normalizeStringArray(Arr::get($overlay, 'tags'));
        if ($tags === []) {
            $tags = $product->tags ?? [];
        }

        $cta = $this->resolveProductCta($overlay, $product);
        $detailUrl = $this->resolveProductDetailUrl($overlay);

        $badge = $this->stringValue(
            Arr::get($overlay, 'badge')
                ?? Arr::get($overlay, 'badge.label')
                ?? Arr::get($overlay, 'flags.0.label')
        );

        return [
            'id' => (string) $product->id,
            'slug' => $product->slug ?? Str::slug($name).'-'.$product->id,
            'sku' => $product->product_code,
            'name' => $name,
            'subtitle' => $subtitle,
            'excerpt' => $excerpt,
            'descriptionMd' => $product->description_md,
            'imageUrl' => $imageUrl,
            'gallery' => $gallery,
            'priceCents' => $priceCents ?? 0,
            'priceCurrency' => $priceCurrency
                ?? $product->price_currency
                ?? $product->custom_currency
                ?? Arr::get($snapshot, 'currency', $tenant['currency']),
            'tags' => $tags,
            'metadata' => $product->metadata ?? [],
            'cta' => $cta,
            'badge' => $badge,
            'detailUrl' => $detailUrl,
            'available' => $product->active ?? $product->visible,
        ];
    }

    private function defaultHero(): array
    {
        return [
            'eyebrow' => 'Limitovaná kolekce',
            'title' => 'Vůně, které definují tvůj podpis',
            'description' => 'Kurátorovaný výběr niche parfémů připravený ke sdílení během minut.',
            'primaryCta' => ['label' => 'Objev kolekci', 'href' => '#kolekce'],
            'secondaryCta' => ['label' => 'Rezervovat konzultaci', 'href' => '#kontakt'],
            'media' => [
                'image' => 'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1200&q=80',
                'alt' => 'Luxusní parfém na mramorovém podstavci',
            ],
        ];
    }

    private function defaultHighlights(): array
    {
        return [
            [
                'title' => 'Kurátorovaný výběr',
                'description' => 'Každý produkt vybíráme podle dat z HUBu a preferencí tvých zákazníků.',
                'icon' => 'Sparkles',
            ],
            [
                'title' => 'Prémiové marže',
                'description' => 'Nastav si vlastní ceny a microshop prezentaci zvládne sám.',
                'icon' => 'Diamond',
            ],
            [
                'title' => 'Blesková publikace',
                'description' => 'Sdílej unikátní URL nebo exportuj na vlastní doménu během minut.',
                'icon' => 'Zap',
            ],
        ];
    }

    private function defaultEditorial(): ?array
    {
        return [
            'title' => 'Rituál parfuméra',
            'bodyMd' => "Vůně je emoce. Vytvořili jsme výběr, který funguje ve vrstvách – od prvního setkání až po poslední podpis na objednávce. Microshop umožňuje tvému týmu pracovat s prémiovým materiálem bez kompromisů: **vysoké marže**, okamžité publikace a napojení na HUB data.",
        ];
    }

    private function defaultTestimonials(): array
    {
        return [
            [
                'quote' => 'Kampaň přes microshop přinesla během prvního týdne 420 000 Kč. VIP klienti milují personalizaci.',
                'author' => 'Lucia Hrubá',
                'role' => 'zakladatelka niche parfumérie',
            ],
            [
                'quote' => 'Microshop jsme spustili za 15 minut a hned první den vyprodali limitovanou kolekci.',
                'author' => 'Ondřej Bystroň',
                'role' => 'COO, KrasneVune.cz',
            ],
        ];
    }

    private function defaultFaqs(): array
    {
        return [
            [
                'question' => 'Jak funguje napojení na Stripe Checkout?',
                'answer' => 'Microshop vytvoří Stripe Checkout Session. Po úspěšné platbě se objednávka propíše do HUBu.',
            ],
            [
                'question' => 'Můžu použít vlastní doménu?',
                'answer' => 'Ano. Přidej CNAME do DNS a označ doménu jako primární — microshop se automaticky publikuje.',
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    private function defaultPalette(): array
    {
        return [
            'primary' => '#6F2CFF',
            'secondary' => '#0B112B',
            'accent' => '#14B8A6',
            'background' => '#020617',
            'surface' => '#0F172A',
            'muted' => '#1E293B',
            'onPrimary' => '#0B1120',
            'onSurface' => '#F8FAFC',
            'gradientFrom' => 'rgba(124, 58, 237, 0.65)',
            'gradientTo' => 'rgba(8, 145, 178, 0.65)',
        ];
    }

    /**
     * @return array<string, string>
     */
    private function defaultTypography(): array
    {
        return [
            'display' => 'Clash Display',
            'sans' => 'Inter',
        ];
    }

    private function resolveTheme(array $schema, Microsite $microsite): array
    {
        $theme = Arr::get($schema, 'theme');
        $brandPalette = $this->filterAssoc($microsite->brand ?? []);
        $palette = array_merge($this->defaultPalette(), $brandPalette);
        $typography = $this->defaultTypography();

        if (is_array($theme)) {
            $paletteOverrides = Arr::get($theme, 'palette');
            if (is_array($paletteOverrides)) {
                $palette = array_merge($palette, $this->filterAssoc($paletteOverrides));
            }

            $typographyOverrides = Arr::get($theme, 'typography');
            if (is_array($typographyOverrides)) {
                $typography = array_merge($typography, $this->filterAssoc($typographyOverrides));
            }
        }

        return [
            'palette' => $palette,
            'typography' => $typography,
        ];
    }

    private function resolveSections(array $schema, array $catalog): array
    {
        $sections = Arr::get($schema, 'sections', []);
        if (! is_array($sections) || $sections === []) {
            return $this->defaultSections($catalog);
        }

        $normalized = [];
        foreach ($sections as $section) {
            if (! is_array($section)) {
                continue;
            }

            $type = Arr::get($section, 'type');
            if (! is_string($type) || $type === '') {
                continue;
            }

            $id = (string) Arr::get($section, 'id', (string) Str::uuid());
            $base = [
                'id' => $id,
                'type' => $type,
                'title' => Arr::get($section, 'title'),
                'subtitle' => Arr::get($section, 'subtitle'),
                'description' => Arr::get($section, 'description'),
            ];

            switch ($type) {
                case 'hero':
                    $normalized[] = array_merge($base, [
                        'eyebrow' => Arr::get($section, 'eyebrow'),
                        'primaryCta' => Arr::get($section, 'primaryCta'),
                        'secondaryCta' => Arr::get($section, 'secondaryCta'),
                        'mediaImage' => Arr::get($section, 'mediaImage'),
                    ]);
                    break;
                case 'product-grid':
                    $normalized[] = array_merge($base, [
                        'limit' => (int) Arr::get($section, 'limit', 6),
                        'layout' => Arr::get($section, 'layout', 'grid'),
                    ]);
                    break;
                case 'highlights':
                case 'testimonials':
                case 'faq':
                    $items = Arr::get($section, 'items', []);
                    if (! is_array($items)) {
                        $items = [];
                    }
                    $normalized[] = array_merge($base, [
                        'items' => array_values(array_map(function ($item) use ($type) {
                            $itemId = (string) Arr::get($item, 'id', (string) Str::uuid());
                            if ($type === 'faq') {
                                return [
                                    'id' => $itemId,
                                    'question' => Arr::get($item, 'question', ''),
                                    'answer' => Arr::get($item, 'answer', ''),
                                ];
                            }

                            if ($type === 'testimonials') {
                                return [
                                    'id' => $itemId,
                                    'quote' => Arr::get($item, 'quote', ''),
                                    'author' => Arr::get($item, 'author', ''),
                                    'role' => Arr::get($item, 'role'),
                                ];
                            }

                            return [
                                'id' => $itemId,
                                'title' => Arr::get($item, 'title', ''),
                                'description' => Arr::get($item, 'description', ''),
                                'icon' => Arr::get($item, 'icon'),
                            ];
                        }, $items)),
                    ]);
                    break;
                case 'cta':
                    $normalized[] = array_merge($base, [
                        'eyebrow' => Arr::get($section, 'eyebrow'),
                        'cta' => Arr::get($section, 'cta'),
                    ]);
                    break;
                default:
                    $normalized[] = $base;
                    break;
            }
        }

        return $normalized === [] ? $this->defaultSections($catalog) : array_values($normalized);
    }

    private function resolveHeader(array $schema, Microsite $microsite, array $pages): array
    {
        $config = Arr::get($schema, 'header');

        $navigation = $this->normalizeNavigation(
            Arr::get($config ?? [], 'navigation'),
            $this->defaultHeaderNavigation($pages)
        );

        return [
            'title' => Arr::get($config, 'title', $microsite->name),
            'subtitle' => Arr::get($config, 'subtitle', Arr::get($microsite->hero ?? [], 'eyebrow') ?? $microsite->name),
            'showPublishedBadge' => (bool) Arr::get($config, 'showPublishedBadge', true),
            'visible' => (bool) Arr::get($config, 'visible', true),
            'navigation' => $navigation,
            'cta' => $this->normalizeCta(Arr::get($config, 'cta')),
        ];
    }

    private function resolveFooter(array $schema): array
    {
        $config = Arr::get($schema, 'footer');

        return [
            'aboutTitle' => Arr::get($config, 'aboutTitle', 'Microshop'),
            'aboutText' => Arr::get($config, 'aboutText', 'Kurátorované microshopy napojené na HUB data.'),
            'contactTitle' => Arr::get($config, 'contactTitle', 'Kontakt'),
            'contactItems' => $this->normalizeContacts(Arr::get($config, 'contactItems')),
            'links' => $this->normalizeFooterLinks(Arr::get($config, 'links')),
            'visible' => (bool) Arr::get($config, 'visible', true),
        ];
    }

    private function defaultSections(array $catalog): array
    {
        return [
            [
                'id' => (string) Str::uuid(),
                'type' => 'hero',
                'eyebrow' => Arr::get($catalog['hero'], 'eyebrow'),
                'title' => Arr::get($catalog['hero'], 'title'),
                'description' => Arr::get($catalog['hero'], 'description'),
                'primaryCta' => Arr::get($catalog['hero'], 'primaryCta'),
                'secondaryCta' => Arr::get($catalog['hero'], 'secondaryCta'),
            ],
            [
                'id' => (string) Str::uuid(),
                'type' => 'product-grid',
                'title' => 'Signature kolekce',
                'subtitle' => 'Kurátorované produkty',
                'description' => 'Seznam produktů se generuje přímo z HUBu.',
                'limit' => 6,
            ],
            [
                'id' => (string) Str::uuid(),
                'type' => 'highlights',
                'title' => 'Proč microshop',
                'items' => collect($this->defaultHighlights())
                    ->map(fn ($item) => ['id' => (string) Str::uuid()] + $item)
                    ->all(),
            ],
            [
                'id' => (string) Str::uuid(),
                'type' => 'testimonials',
                'title' => 'Reference',
                'items' => collect($this->defaultTestimonials())
                    ->map(fn ($item) => ['id' => (string) Str::uuid()] + $item)
                    ->all(),
            ],
            [
                'id' => (string) Str::uuid(),
                'type' => 'faq',
                'title' => 'FAQ',
                'items' => collect($this->defaultFaqs())
                    ->map(fn ($item) => ['id' => (string) Str::uuid()] + $item)
                    ->all(),
            ],
            [
                'id' => (string) Str::uuid(),
                'type' => 'cta',
                'title' => 'Připraveni otevřít microshop?',
                'description' => 'Spoj se s concierge týmem a spusť katalog během minut.',
                'cta' => [
                    'label' => 'Domluvit konzultaci',
                    'href' => '#kontakt',
                ],
            ],
        ];
    }

    private function resolveDomains(Microsite $microsite): array
    {
        $domains = array_filter([
            $microsite->primary_domain,
            ...($microsite->domains ?? []),
        ]);

        return array_values(array_unique($domains));
    }

    /**
     * @param  array<string, mixed>  $values
     * @return array<string, mixed>
     */
    private function filterAssoc(array $values): array
    {
        return array_filter(
            $values,
            fn ($value) => $value !== null && $value !== ''
        );
    }

    private function defaultHeaderNavigation(array $pages): array
    {
        $nav = [
            ['label' => 'Kolekce', 'href' => '/#kolekce'],
        ];

        $publishedPages = collect($pages)
            ->filter(fn ($page) => Arr::get($page, 'published'))
            ->take(3)
            ->map(fn ($page) => [
                'label' => $page['title'] ?? 'Stránka',
                'href' => $page['path'] ?? '/',
            ])
            ->values()
            ->all();

        $nav = array_merge($nav, $publishedPages, [
            ['label' => 'FAQ', 'href' => '/#faq'],
            ['label' => 'Kontakt', 'href' => '/#kontakt'],
        ]);

        return $nav;
    }

    private function normalizeNavigation(mixed $items, array $fallback): array
    {
        if (! is_array($items) || $items === []) {
            return $fallback;
        }

        $normalized = [];
        foreach ($items as $item) {
            $label = Arr::get($item, 'label');
            if (! is_string($label) || trim($label) === '') {
                continue;
            }

            $href = Arr::get($item, 'href');
            $normalized[] = [
                'label' => $label,
                'href' => is_string($href) && $href !== '' ? $href : '/',
            ];
        }

        return $normalized === [] ? $fallback : $normalized;
    }

    private function normalizeCta(mixed $cta): ?array
    {
        if (! is_array($cta)) {
            return null;
        }

        $label = Arr::get($cta, 'label');
        if (! is_string($label) || trim($label) === '') {
            return null;
        }

        $href = Arr::get($cta, 'href');

        return [
            'label' => trim($label),
            'href' => is_string($href) && $href !== '' ? $href : '/',
        ];
    }

    private function normalizeContacts(mixed $items): array
    {
        if (! is_array($items) || $items === []) {
            return $this->defaultFooterContacts();
        }

        $normalized = [];
        foreach ($items as $item) {
            $label = Arr::get($item, 'label');
            $value = Arr::get($item, 'value');
            if (! is_string($label) || trim($label) === '' || ! is_string($value) || trim($value) === '') {
                continue;
            }

            $normalized[] = [
                'label' => $label,
                'value' => $value,
            ];
        }

        return $normalized === [] ? $this->defaultFooterContacts() : $normalized;
    }

    private function normalizeFooterLinks(mixed $items): array
    {
        if (! is_array($items) || $items === []) {
            return $this->defaultFooterLinks();
        }

        $normalized = [];
        foreach ($items as $item) {
            $label = Arr::get($item, 'label');
            $href = Arr::get($item, 'href');
            if (! is_string($label) || trim($label) === '') {
                continue;
            }

            $normalized[] = [
                'label' => $label,
                'href' => is_string($href) && $href !== '' ? $href : '/',
            ];
        }

        return $normalized === [] ? $this->defaultFooterLinks() : $normalized;
    }

    private function defaultFooterContacts(): array
    {
        return [
            [
                'label' => 'Podpora HUB',
                'value' => 'support@krasnevune.cz',
            ],
        ];
    }

    private function defaultFooterLinks(): array
    {
        return [
            ['label' => 'Kolekce', 'href' => '/#kolekce'],
            ['label' => 'Kontakt', 'href' => '/#kontakt'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function normalizeOverlay(mixed $overlay): array
    {
        return is_array($overlay) ? $overlay : [];
    }

    /**
     * @return array{priceCents: ?int, currency: ?string}
     */
    private function resolveOverlayPrice(array $overlay): array
    {
        $priceNodes = [
            Arr::get($overlay, 'price'),
            Arr::get($overlay, 'pricing'),
        ];

        foreach ($priceNodes as $node) {
            if (! is_array($node)) {
                continue;
            }

            $value = $this->floatValue(
                $node['current_value'] ?? $node['current'] ?? $node['value'] ?? Arr::get($node, 'price')
            );

            if ($value === null) {
                continue;
            }

            $currency = $this->stringValue(
                $node['currency'] ?? $node['currency_code'] ?? Arr::get($node, 'price_currency')
            );

            return [
                'priceCents' => (int) round($value * 100),
                'currency' => $currency,
            ];
        }

        $value = $this->floatValue(Arr::get($overlay, 'price'));
        if ($value !== null) {
            return [
                'priceCents' => (int) round($value * 100),
                'currency' => $this->stringValue(Arr::get($overlay, 'currency')),
            ];
        }

        return ['priceCents' => null, 'currency' => null];
    }

    /**
     * @return array<int, string>
     */
    private function resolveOverlayGallery(array $overlay): array
    {
        $sources = [
            Arr::get($overlay, 'gallery'),
            Arr::get($overlay, 'media.gallery'),
            Arr::get($overlay, 'images'),
        ];

        foreach ($sources as $source) {
            $gallery = $this->normalizeStringArray($source);
            if ($gallery !== []) {
                return $gallery;
            }
        }

        return [];
    }

    /**
     * @return array<int, string>
     */
    private function resolveSnapshotGallery(array $snapshot): array
    {
        $images = Arr::get($snapshot, 'images');
        if (! is_array($images)) {
            return [];
        }

        $gallery = [];
        foreach ($images as $image) {
            if (is_array($image) && isset($image['url']) && is_string($image['url'])) {
                $gallery[] = $image['url'];
                continue;
            }

            if (is_string($image)) {
                $gallery[] = $image;
            }
        }

        return array_values(array_filter($gallery, fn ($value) => is_string($value) && trim($value) !== ''));
    }

    /**
     * @return array<int, string>
     */
    private function normalizeStringArray(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $normalized = [];

        foreach ($value as $item) {
            if (is_string($item) && trim($item) !== '') {
                $normalized[] = trim($item);
                continue;
            }

            if (is_array($item)) {
                $candidate = Arr::get($item, 'url') ?? Arr::get($item, 'href');
                if (is_string($candidate) && trim($candidate) !== '') {
                    $normalized[] = trim($candidate);
                }
            }
        }

        return array_values(array_filter($normalized, fn ($item) => $item !== ''));
    }

    private function stringValue(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim(strip_tags($value));

        return $trimmed === '' ? null : $trimmed;
    }

    private function floatValue(mixed $value): ?float
    {
        if ($value === null) {
            return null;
        }

        if (is_numeric($value)) {
            return (float) $value;
        }

        if (is_string($value)) {
            $normalized = str_replace([' ', ' '], '', str_replace(',', '.', $value));
            return is_numeric($normalized) ? (float) $normalized : null;
        }

        return null;
    }

    private function resolveProductCta(array $overlay, MicrositeProduct $product): ?array
    {
        $cta = Arr::get($overlay, 'cta');
        if (is_array($cta)) {
            $label = $this->stringValue($cta['label'] ?? null);
            $href = $this->stringValue($cta['href'] ?? null);

            if ($label && $href) {
                return ['label' => $label, 'href' => $href];
            }
        }

        $detailButton = Arr::get($overlay, 'detail_button');
        if (is_array($detailButton)) {
            $label = $this->stringValue($detailButton['label'] ?? null);
            $href = $this->stringValue($detailButton['url'] ?? $detailButton['href'] ?? null);
            if ($label && $href) {
                return ['label' => $label, 'href' => $href];
            }
        }

        $ctaLabel = $this->stringValue($product->cta_text);
        $ctaHref = $this->stringValue($product->cta_url);

        if ($ctaLabel && $ctaHref) {
            return [
                'label' => $ctaLabel,
                'href' => $ctaHref,
            ];
        }

        return null;
    }

    private function resolveProductDetailUrl(array $overlay): ?string
    {
        $candidates = [
            Arr::get($overlay, 'detail_url'),
            Arr::get($overlay, 'detail_button.url'),
            Arr::get($overlay, 'url'),
        ];

        foreach ($candidates as $candidate) {
            $value = $this->stringValue($candidate);
            if ($value) {
                return $value;
            }
        }

        return null;
    }
}
