<?php

namespace Modules\Inventory\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Http;
use Modules\Inventory\Services\InventoryRecommendationService;
use Modules\Inventory\Models\InventoryProductRecommendation;
use Modules\Inventory\Models\InventoryVariantRecommendation;
use Modules\Inventory\Support\InventoryVariantContext;
use Modules\Microsites\Services\MicrositeProductResolver;
use Modules\Pim\Models\ProductVariant;
use Modules\Pim\Models\ProductWidget;
use Modules\Pim\Models\ProductWidgetItem;
use Modules\Pim\Services\ProductWidgetRenderer;

class InventoryRecommendationWidgetController extends Controller
{
    private const GENDER_THEMES = [
        'female' => [
            'color' => '#d6345a',
            'icon' => 'https://www.krasnevune.cz/user/documents/svg/female.svg',
            'background' => 'https://www.krasnevune.cz/user/documents/upload/woman_bg_p.svg',
        ],
        'male' => [
            'color' => '#3461d6',
            'icon' => 'https://www.krasnevune.cz/user/documents/svg/male.svg',
            'background' => 'https://www.krasnevune.cz/user/documents/upload/man_bg_p.svg',
        ],
        'unisex' => [
            'color' => '#000000',
            'icon' => 'https://www.krasnevune.cz/user/documents/svg/unisex_icon.svg',
            'background' => 'https://www.krasnevune.cz/user/documents/upload/uni_bg_p.svg',
        ],
        'unknown' => [
            'color' => '#282828',
            'icon' => '',
            'background' => 'https://www.krasnevune.cz/user/documents/upload/uni_bg_p.svg',
        ],
    ];

    /**
     * @var string[]
     */
    private const KNOWN_BRANDS = [
        'ARMANI',
        'GIORGIO ARMANI',
        'PRADA',
        'YSL',
        'YVES SAINT LAURENT',
        'LANCOME',
        'LANCÔME',
        'DIOR',
        'CHANEL',
        'LOUIS VUITTON',
        'VERSACE',
        'KAYALI',
        'PACO RABANNE',
        'GUCCI',
        'HERMES',
        'HERMÈS',
        'VALENTINO',
        'MUGLER',
        'THIERRY MUGLER',
        'GIVENCHY',
        'DOLCE & GABBANA',
        'DOLCE GABBANA',
        'D&G',
        'BURBERRY',
        'CALVIN KLEIN',
        'CK',
        'CAROLINA HERRERA',
        'LANVIN',
        'HUGO BOSS',
        'BOSS',
        'CLINIQUE',
        'ESTEE LAUDER',
        'ESTÉE LAUDER',
        'JIMMY CHOO',
        'BALENCIAGA',
        'TOM FORD',
        'MAISON FRANCIS KURKDJIAN',
        'NINA RICCI',
        'KENZO',
        'BVLGARI',
        'BULGARI',
        'SALVATORE FERRAGAMO',
        'JO MALONE',
        'ISSEY MIYAKE',
    ];

    /**
     * @var string[]
     */
    private const LOCAL_BRANDS = [
        'PURE',
        'SAPHIR',
    ];

    /**
     * @var string[]
     */
    private const MEASUREMENT_KEYWORDS = [
        'VELIKOST',
        'SIZE',
        'OBJEM',
        'VOLUME',
        'CAPACITY',
        'BALENI',
        'BALENÍ',
        'CONTENT',
    ];

    /**
     * @var string[]
     */
    private const MEASUREMENT_UNITS = [
        'ML',
        'L',
        'G',
        'KG',
        'OZ',
        'MG',
    ];

    public function __construct(
        private readonly InventoryRecommendationService $recommendations,
        private readonly ProductWidgetRenderer $renderer,
        private readonly MicrositeProductResolver $resolver
    ) {
    }

    private const EXCLUDE_KEYWORDS = [
        'tester',
        'vzorek',
        'sample',
        'bez víčka',
        'bez vicka',
        'bez víka',
        'bez vika',
        'bez krabičky',
        'bez krabicky',
        'bez víčka a krabičky',
        'bez víčka a krabicky',
    ];

    public function script(Request $request)
    {
        $startedAt = microtime(true);
        $timeBudgetSeconds = 8.0;
        $data = $request->validate([
            'widget_id' => ['required', 'uuid', 'exists:product_widgets,id'],
            'variant_code' => ['nullable', 'string', 'max:120'],
            'variant_id' => ['nullable', 'string', 'max:120'],
            'product_code' => ['nullable', 'string', 'max:120'],
            'page_type' => ['nullable', 'string', 'max:120'],
            'language' => ['nullable', 'string', 'max:32'],
            'currency' => ['nullable', 'string', 'max:32'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:12'],
            'container' => ['nullable', 'string', 'max:128'],
            'mode' => ['nullable', 'string', 'in:fragrance,nonfragrance,similarity,product'],
        ]);

        $variantCode = Arr::get($data, 'variant_code');
        $variantId = Arr::get($data, 'variant_id');
        $productCode = Arr::get($data, 'product_code');

        if ($variantCode === null && $variantId === null && $productCode === null) {
            return $this->emptyScriptResponse();
        }

        $template = ProductWidget::query()
            ->with('items')
            ->findOrFail($data['widget_id']);

        $variant = null;
        $query = ProductVariant::query()->with('product');

        if ($variantCode !== null) {
            $variant = (clone $query)
                ->where('code', $variantCode)
                ->first();
        }

        if (! $variant && $variantId !== null) {
            $variant = (clone $query)
                ->whereKey($variantId)
                ->first();
        }

        if (! $variant && $productCode !== null) {
            $variant = (clone $query)
                ->where('code', $productCode)
                ->first();
        }

        if (! $variant && $productCode !== null) {
            $variant = (clone $query)
                ->whereHas('remoteRefs', fn ($q) => $q->where('remote_code', $productCode))
                ->first();
        }

        if (! $variant && $productCode !== null) {
            $variant = (clone $query)
                ->whereHas('product', fn ($q) => $q
                    ->where('external_guid', $productCode)
                    ->orWhere('sku', $productCode)
                )
                ->first();
        }

        if (! $variant) {
            return $this->emptyScriptResponse();
        }

        // Pro Shoptet držme vždy plný počet – fixně 12 položek.
        $limit = 12;
        $mode = Arr::get($data, 'mode');
        $hideMatchReasons = $mode ? true : false;
        if ($mode === 'product') {
            $recommendations = $this->fetchProductRecommendations($variant, $limit);
        } elseif ($mode === 'similarity') {
            $recommendations = $this->recommendations->recommend($variant, $limit);
        } elseif ($mode) {
            $recommendations = $this->recommendations->recommendByInspirationType($variant, $limit, $mode);
        } else {
            $recommendations = $this->fetchPrecomputedRecommendations($variant, $limit);

            // If precomputed set is smaller than requested limit, top up live so Shoptet sees plný počet.
            if (count($recommendations) < $limit) {
                $live = $this->recommendations->recommend($variant, $limit * 2);
                if ($live !== []) {
                    $existingIds = collect($recommendations)
                        ->map(fn ($r) => Arr::get($r, 'variant.id'))
                        ->filter()
                        ->values();

                    foreach ($live as $entry) {
                        if (count($recommendations) >= $limit) {
                            break;
                        }

                        $id = Arr::get($entry, 'variant.id');
                        if ($id && ! $existingIds->contains($id)) {
                            $recommendations[] = $entry;
                            $existingIds->push($id);
                        }
                    }
                }
            }
        }

        if ((microtime(true) - $startedAt) > $timeBudgetSeconds) {
            return $this->emptyScriptResponse();
        }

        if ($recommendations === []) {
            return $this->emptyScriptResponse();
        }

        $baseContext = InventoryVariantContext::build($variant);
        $baseContext = InventoryVariantContext::build($variant);
        $baseBrand = $this->resolveBrandFromContext($baseContext);
        $items = $this->buildWidgetItems(
            $recommendations,
            $variant->product?->shop_id,
            $limit,
            $baseContext,
            $baseBrand,
            $hideMatchReasons
        );

        if ($items->isEmpty()) {
            return $this->emptyScriptResponse();
        }

        $dynamicWidget = $this->cloneWidgetWithItems($template, $items, $data['container'] ?? null);
        $render = $this->renderer->render($dynamicWidget);

        return response()->view('pim::widgets.script', [
            'token' => $dynamicWidget->public_token,
            'html' => $render['html'],
            'styles' => $render['styles'],
            'containerId' => $render['settings']['container_id'] ?? null,
            'containerClass' => $render['settings']['container_class'] ?? null,
        ], 200, [
            'Content-Type' => 'application/javascript; charset=UTF-8',
            'Cache-Control' => 'public, max-age=30',
        ]);
    }

    private function emptyScriptResponse()
    {
        $script = <<<'JS'
(function(){
  var scriptTag = document.currentScript;
  if (!scriptTag) { return; }
  var target = scriptTag.getAttribute('data-target');
  if (!target) { return; }
  var container = null;
  if (target.charAt(0) === '#') {
    container = document.getElementById(target.slice(1));
  }
  if (!container) {
    container = document.getElementById(target) || document.querySelector(target);
  }
  if (container) {
    container.setAttribute('data-kv-widget', 'empty');
    container.setAttribute('data-kv-widget-loaded', '1');
    if (!container.innerHTML.trim()) {
      container.style.display = 'none';
    }
  }
})();
JS;

        return response($script, 200, [
            'Content-Type' => 'application/javascript; charset=UTF-8',
            'Cache-Control' => 'public, max-age=30',
        ]);
    }

    /**
     * @param  array<int, array<string, mixed>>  $recommendations
     */
    private function buildWidgetItems(array $recommendations, ?int $shopId, int $limit, array $baseContext, ?string $baseBrand, bool $hideMatchReasons = false): Collection
    {
        $items = collect();

        foreach ($recommendations as $index => $entry) {
            if ($items->count() >= $limit) {
                break;
            }

            $variantId = Arr::get($entry, 'variant.id');
            if (! $variantId) {
                continue;
            }

            $variantModel = ProductVariant::query()
                ->with([
                    'product',
                    'product.overlays' => static function ($query) use ($shopId): void {
                        if ($shopId) {
                            $query->where('shop_id', $shopId);
                        }
                    },
                ])
                ->find($variantId);

            if (! $variantModel) {
                continue;
            }

            $nameCandidates = [
                $variantModel->name ?? null,
                $variantModel->product?->name ?? null,
                Arr::get($variantModel->product?->base_payload ?? [], 'name'),
                Arr::get($entry, 'variant.name'),
                Arr::get($entry, 'variant.title'),
            ];
            $isSample = false;
            foreach ($nameCandidates as $candidateName) {
                if (! is_string($candidateName) || $candidateName === '') {
                    continue;
                }
                $normalizedName = mb_strtolower($candidateName, 'UTF-8');
                if (str_contains($normalizedName, 'vzorek')) {
                    $isSample = true;
                    break;
                }
            }
            if ($isSample) {
                continue;
            }

            $snapshot = $this->resolver->snapshotByVariantId($variantId, $shopId);
            if (! $snapshot) {
                continue;
            }

            $payload = $this->buildItemPayload($snapshot, $entry, $variantModel, $baseContext, $baseBrand, $hideMatchReasons, $shopId);
            if ($payload === null) {
                continue;
            }

            $items->push(new ProductWidgetItem([
                'id' => (string) Str::uuid(),
                'product_widget_id' => null,
                'payload' => $payload,
                'position' => $index,
            ]));
        }

        return $items;
    }

    private function fetchPrecomputedRecommendations(ProductVariant $variant, int $limit): array
    {
        $records = InventoryVariantRecommendation::query()
            ->where('variant_id', $variant->id)
            ->orderBy('position')
            ->limit($limit)
            ->get();

        if ($records->isEmpty()) {
            return [];
        }

        $variantIds = $records->pluck('recommended_variant_id')->all();
        $variantModels = ProductVariant::query()
            ->with('product')
            ->whereIn('id', $variantIds)
            ->get()
            ->keyBy('id');

        $recommendations = [];

        foreach ($records as $record) {
            $recommended = $variantModels->get($record->recommended_variant_id);
            if (! $recommended) {
                continue;
            }

            if ($this->isExcludedVariant($recommended)) {
                continue;
            }

            if (is_numeric($recommended->stock) && (float) $recommended->stock <= 0.0) {
                continue;
            }

            $recommendations[] = [
                'variant' => [
                    'id' => $recommended->id,
                    'code' => $recommended->code,
                    'name' => $recommended->name,
                    'brand' => $recommended->brand,
                    'supplier' => $recommended->supplier,
                    'currency_code' => $recommended->currency_code,
                    'stock' => $recommended->stock,
                    'price' => $recommended->price,
                    'data' => $recommended->data ?? [],
                    'product' => [
                        'id' => $recommended->product?->id,
                        'shop_id' => $recommended->product?->shop_id,
                        'base_payload' => $recommended->product?->base_payload ?? [],
                        'status' => $recommended->product?->status,
                    ],
                ],
                'score' => $record->score,
                'matches' => $record->matches ?? [],
            ];

            if (count($recommendations) >= $limit) {
                break;
            }
        }

        return $recommendations;
    }

    private function fetchProductRecommendations(ProductVariant $variant, int $limit): array
    {
        $productId = $variant->product?->id ?? $variant->product_id;
        if (! $productId) {
            return [];
        }

        $records = InventoryProductRecommendation::query()
            ->where('product_id', $productId)
            ->where('type', InventoryProductRecommendation::TYPE_RECOMMENDED)
            ->orderBy('position')
            ->limit($limit)
            ->get();

        if ($records->isEmpty()) {
            return [];
        }

        $variantIds = $records->pluck('recommended_variant_id')->filter()->all();
        $recommendedVariants = ProductVariant::query()
            ->with('product')
            ->whereIn('id', $variantIds)
            ->get()
            ->keyBy('id');

        $recommendations = [];

        foreach ($records as $record) {
            $recommended = $record->recommended_variant_id
                ? $recommendedVariants->get($record->recommended_variant_id)
                : null;

            if (! $recommended) {
                continue;
            }

            if ($this->isExcludedVariant($recommended)) {
                continue;
            }

            if (is_numeric($recommended->stock) && (float) $recommended->stock <= 0.0) {
                continue;
            }

            $recommendations[] = [
                'variant' => [
                    'id' => $recommended->id,
                    'code' => $recommended->code,
                    'name' => $recommended->name,
                    'brand' => $recommended->brand,
                    'supplier' => $recommended->supplier,
                    'currency_code' => $recommended->currency_code,
                    'stock' => $recommended->stock,
                    'price' => $recommended->price,
                    'data' => $recommended->data ?? [],
                    'product' => [
                        'id' => $recommended->product?->id,
                        'shop_id' => $recommended->product?->shop_id,
                        'base_payload' => $recommended->product?->base_payload ?? [],
                        'status' => $recommended->product?->status,
                    ],
                ],
                'score' => $record->score,
                'matches' => $record->matches ?? [],
            ];
        }

        return array_slice($recommendations, 0, $limit);
    }

    /**
     * @param  array<string, mixed>  $snapshot
     * @param  array<string, mixed>  $recommendation
     */
    private function buildItemPayload(array $snapshot, array $recommendation, ProductVariant $variant, array $baseContext, ?string $baseBrand, bool $hideMatchReasons = false, ?int $shopId = null): ?array
    {
        $variantId = Arr::get($recommendation, 'variant.id');
        $variantCode = Arr::get($recommendation, 'variant.code');

        if (! $variantId || ! $variantCode) {
            return null;
        }

        $variantOptions = collect(Arr::get($snapshot, 'variant_options', []));
        $selectedOption = $variantOptions->firstWhere('id', $variantId)
            ?? $variantOptions->firstWhere('code', $variantCode)
            ?? $variantOptions->firstWhere('code', Arr::get($recommendation, 'variant.code'))
            ?? $variantOptions->first();

        if (! $selectedOption) {
            return null;
        }

        $stockCandidates = [
            $selectedOption['stock_level'] ?? null,
            Arr::get($recommendation, 'variant.stock'),
            $variant->stock,
        ];
        $hasPositiveStock = null;
        foreach ($stockCandidates as $candidate) {
            if (is_numeric($candidate)) {
                $hasPositiveStock = (float) $candidate > 0;
                break;
            }
        }
        if ($hasPositiveStock === null) {
            $hasPositiveStock = $variantOptions->contains(static function ($option): bool {
                $value = $option['stock_level'] ?? $option['stock'] ?? null;
                return is_numeric($value) ? (float) $value > 0 : false;
            });
        }
        if (! $hasPositiveStock) {
            return null;
        }

        $statusCandidates = [
            Arr::get($recommendation, 'variant.product.status'),
            Arr::get($recommendation, 'variant.status'),
            Arr::get($recommendation, 'variant.data.status'),
            Arr::get($snapshot, 'metadata.status'),
            Arr::get($variant->product?->base_payload ?? [], 'metadata.status'),
            $variant->product?->status,
        ];
        if ($shopId && $variant->product && $variant->product->relationLoaded('overlays')) {
            $overlayStatus = optional($variant->product->overlays->firstWhere('shop_id', $shopId))->status;
            if ($overlayStatus !== null) {
                $statusCandidates[] = $overlayStatus;
            }
        }
        foreach ($statusCandidates as $candidate) {
            $normalizedStatus = $this->normalizeComparableString(is_string($candidate) ? $candidate : null);
            if ($normalizedStatus === null || $normalizedStatus === '') {
                continue;
            }
            if (! $this->isVisibleStatus($normalizedStatus)) {
                return null;
            }
            break;
        }

        $context = InventoryVariantContext::build($variant);
        $productPayload = is_array($variant->product?->base_payload) ? $variant->product->base_payload : [];
        $detailUrl = $this->normalizeUrl($selectedOption['url'] ?? null)
            ?? $this->normalizeUrl(Arr::get($recommendation, 'variant.data.detailUrl'))
            ?? $this->normalizeUrl(Arr::get($recommendation, 'variant.data.url'))
            ?? $this->normalizeUrl(Arr::get($snapshot, 'metadata.detail_url'))
            ?? $this->normalizeUrl(Arr::get($snapshot, 'metadata.detailUrl'))
            ?? $this->normalizeUrl(Arr::get($snapshot, 'metadata.url'))
            ?? $this->normalizeUrl(Arr::get($productPayload, 'metadata.detail_url'))
            ?? $this->normalizeUrl(Arr::get($productPayload, 'metadata.detailUrl'))
            ?? $this->normalizeUrl(Arr::get($productPayload, 'metadata.url'))
            ?? $this->normalizeUrl(Arr::get($productPayload, 'url'))
            ?? $this->normalizeUrl(Arr::get($snapshot, 'url'))
            ?? $this->normalizeUrl(Arr::get($snapshot, 'variant_options.0.url'))
            ?? $this->normalizeUrl(Arr::get($variant->data ?? [], 'url'));
        $imageUrl = $this->resolveImageUrl($selectedOption, $snapshot);
        $miniImageUrl = $this->resolveMiniImageUrl($selectedOption, $snapshot, $recommendation, $variant);

        $priceCurrent = $this->formatPriceValue($selectedOption['price'] ?? Arr::get($snapshot, 'price'));
        $priceOriginal = $this->formatPriceValue(
            $selectedOption['original_price']
                ?? Arr::get($recommendation, 'variant.data.price.original')
        );

        $currency = $selectedOption['currency']
            ?? Arr::get($recommendation, 'variant.currency_code')
            ?? Arr::get($snapshot, 'currency')
            ?? 'CZK';

        $explicitBrand = $this->formatBrandName(
            $this->normalizeString(
                Arr::get($recommendation, 'variant.data.original_brand')
                    ?? Arr::get($recommendation, 'variant.data.originalBrand')
                    ?? Arr::get($recommendation, 'variant.data.inspired_by_brand')
                    ?? Arr::get($recommendation, 'variant.data.inspiredByBrand')
            )
        );

        $explicitTitle = $this->normalizeString(
            Arr::get($recommendation, 'variant.data.original_name')
                ?? Arr::get($recommendation, 'variant.data.originalName')
                ?? Arr::get($recommendation, 'variant.data.inspired_by_title')
                ?? Arr::get($recommendation, 'variant.data.inspiredByTitle')
        );

        $inspiration = $this->extractInspiration($context, $snapshot, $recommendation);
        if (! $inspiration['title'] || ! $miniImageUrl) {
            $originalInfo = $this->fetchOriginalInfo($variantCode);
            if ($originalInfo) {
                if (! $inspiration['title'] && ! empty($originalInfo['original_name'])) {
                    $inspiration['title'] = $originalInfo['original_name'];
                }
                if (! $miniImageUrl && ! empty($originalInfo['image_url'])) {
                    $miniImageUrl = $originalInfo['image_url'];
                }
            }
        }
        if ($explicitBrand) {
            $inspiration['brand'] = $explicitBrand;
        }
        if ($explicitTitle) {
            $inspiration['title'] = $explicitTitle;
        }
        // Hard override: if brand resolved as CK but title hints contain "opium", set brand to YSL.
        $inspirationTitleComparable = $this->normalizeComparableString($inspiration['title'] ?? null);
        if (($inspiration['brand'] ?? null) && $this->normalizeComparableString($inspiration['brand']) === 'ck') {
            if (is_string($inspirationTitleComparable) && str_contains($inspirationTitleComparable, 'opium')) {
                $inspiration['brand'] = 'YSL';
            }
        }
        $gender = $this->detectGender($context, $snapshot, $recommendation);
        $matches = Arr::get($recommendation, 'matches', []);
        if ($baseContext !== [] && (empty($matches['descriptors']) && empty($matches['filters']))) {
            $fallbackMatches = $this->computeFallbackMatches($baseContext, $context);
            if (! empty($fallbackMatches)) {
                $matches = array_merge($matches, $fallbackMatches);
            }
        }
        $genderIconUrl = null;
        $explicitGenderIcon = $selectedOption['gender_icon_url']
            ?? $selectedOption['gender_icon']
            ?? Arr::get($recommendation, 'variant.data.gender_icon_url')
            ?? Arr::get($recommendation, 'variant.data.genderIconUrl')
            ?? Arr::get($snapshot, 'metadata.gender_icon_url')
            ?? Arr::get($snapshot, 'metadata.genderIconUrl')
            ?? null;
        if ($gender === 'unknown') {
            $genderIconUrl = null;
        } else {
            $genderIconUrl = $explicitGenderIcon ?: (self::GENDER_THEMES[$gender]['icon'] ?? null);
        }
        $theme = self::GENDER_THEMES[$gender] ?? self::GENDER_THEMES['unknown'];
        if ($genderIconUrl === null && $gender !== 'unknown') {
            $genderIconUrl = $explicitGenderIcon ?: ($theme['icon'] ?? null);
        }
        $tags = $this->extractTags($context, $snapshot, $recommendation);
        $highlightTags = $this->resolveHighlightTags($tags, $matches);
        $highlightGender = $this->shouldHighlightGender($matches);
        $matchReasons = $this->buildMatchReasons(
            $matches,
            $inspiration['brand'],
            $highlightTags,
            $highlightGender,
            $tags,
            $gender,
            $baseBrand
        );
        // Do not render match reasons in the widget.
        $matchReasons = [];
        $variantOptionsPayload = $this->buildVariantOptions(
            $snapshot['variant_options'] ?? [],
            $currency,
            $inspiration['brand'],
            $inspiration['title']
        );
        if ($variantOptionsPayload === []) {
            return null;
        }

        $volumeLabel = $this->stripSizePrefix(
            $selectedOption['volume'] ?? Arr::get($recommendation, 'variant.data.volume.value') ?? null
        );
        $volumeUnit = $this->stripSizePrefix(
            $selectedOption['volume_unit'] ?? Arr::get($recommendation, 'variant.data.volume.unit') ?? null
        );
        $displayVolume = $volumeLabel;
        if ($volumeLabel && $volumeUnit && ! str_contains(mb_strtolower($volumeLabel, 'UTF-8'), mb_strtolower($volumeUnit, 'UTF-8'))) {
            $displayVolume = trim($volumeLabel.' '.$volumeUnit);
        }
        if (! $this->looksLikeVolume($displayVolume)) {
            $displayVolume = null;
        }

        $metadata = array_filter([
            'product_subtitle' => $this->buildSubtitle($snapshot, $recommendation, $selectedOption, $productPayload),
            'size' => $displayVolume,
            'product_size_unit' => $volumeUnit,
            'inspired_by_brand' => $inspiration['brand'],
            'inspired_by_title' => $inspiration['title'],
            'original_brand' => $inspiration['brand'],
            'original_name' => $inspiration['title'],
            'fragrance_type_reco' => implode(', ', $tags),
            'znacka' => $inspiration['brand'] ?: Arr::get($recommendation, 'variant.brand'),
            'highlight_tags' => $highlightTags ?: null,
            'highlight_gender' => $highlightGender ? true : null,
            // Hide match reasons entirely per request.
            'match_reasons' => [],
            'hide_match_reasons' => true,
        ], static fn ($value) => $value !== null && $value !== '');

        $discountPercent = null;
        if ($priceCurrent !== null && $priceOriginal !== null && $priceOriginal > 0 && $priceCurrent < $priceOriginal) {
            $discountPercent = (int) round(max(0, 100 - ($priceCurrent / $priceOriginal) * 100));
        }

        return array_filter([
            'title' => $snapshot['name'] ?? Arr::get($recommendation, 'variant.name') ?? 'Produkt',
            'subtitle' => $metadata['product_subtitle'] ?? null,
            'image_url' => $imageUrl,
            'mini_image_url' => $miniImageUrl,
            'gender' => $gender,
            'gender_icon_url' => $genderIconUrl,
            'title_color' => $theme['color'],
            'appendix_background_url' => $theme['background'],
            'inspired_by_brand' => $inspiration['brand'],
            'inspired_by_title' => $inspiration['title'],
            'original_name' => $inspiration['title'],
            'tags' => $tags,
            'detail_button' => [
                'label' => 'Detail',
                'url' => $detailUrl ?? '#',
            ],
            'price' => array_filter([
                'current' => $priceCurrent,
                'original' => $priceOriginal,
                'volume' => $displayVolume,
                'discount' => $discountPercent,
            ], static fn ($value) => $value !== null && $value !== ''),
            'buy_button' => [
                'variant_code' => $variantCode,
                'variant_id' => $variantId,
            ],
            'variant_options' => $variantOptionsPayload,
            'metadata' => $metadata,
        ], static fn ($value) => $value !== null && $value !== '');
    }

    private function buildMatchReasons(
        array $matches,
        ?string $brand,
        array $highlightTags,
        bool $highlightGender,
        array $tags,
        string $gender,
        ?string $baseBrand
    ): array {
        $reasons = [];
        $baseBrandNormalized = $this->normalizeComparableString($baseBrand ?? null);

        foreach (Arr::get($matches, 'descriptors', []) as $descriptorMatch) {
            if (! is_array($descriptorMatch)) {
                continue;
            }
            if (! empty($descriptorMatch['values'])) {
                $reasons[] = 'Inspirováno/podobné: '.implode(', ', (array) $descriptorMatch['values']);
            } else {
                $reasons[] = 'Inspirováno/podobné';
            }
        }

        foreach (Arr::get($matches, 'filters', []) as $filterMatch) {
            if (! is_array($filterMatch)) {
                continue;
            }
            $type = Str::lower((string) ($filterMatch['type'] ?? ''));
            $values = (array) ($filterMatch['values'] ?? []);
            $label = (string) ($filterMatch['name'] ?? $filterMatch['type'] ?? '');

            if ($type === 'brand') {
                $allowedValues = [];
                foreach ($values as $value) {
                    if (! is_string($value)) {
                        continue;
                    }
                    $normalized = $this->normalizeComparableString($value);
                    if ($baseBrandNormalized !== null) {
                        if ($normalized === $baseBrandNormalized) {
                            $allowedValues[] = $value;
                        }
                    } elseif ($normalized !== null) {
                        $allowedValues[] = $value;
                    }
                }
                if ($baseBrandNormalized !== null && $allowedValues === []) {
                    continue;
                }
                $brandValues = $allowedValues ?: array_filter($values, static fn ($v) => is_string($v) && trim($v) !== '');
                if ($brandValues !== []) {
                    $reasons[] = 'Značka originálu: '.implode(', ', $brandValues);
                }
                continue;
            }
            if ($type === 'gender') {
                $reasons[] = 'Pohlaví: '.implode(', ', $values);
                continue;
            }
            if ($label !== '' && $values !== []) {
                $reasons[] = $label.': '.implode(', ', $values);
            }
        }

        $genderLabel = match ($gender) {
            'male' => 'Pánské',
            'female' => 'Dámské',
            'unisex' => 'Unisex',
            default => null,
        };
        if ($genderLabel) {
            $reasons[] = 'Pohlaví: '.$genderLabel;
        } elseif ($highlightGender) {
            $reasons[] = 'Pohlaví';
        }

        if ($highlightTags !== []) {
            $reasons[] = 'Shodné tóny: '.implode(', ', $highlightTags);
        } elseif ($tags !== []) {
            $reasons[] = 'Tóny: '.implode(', ', array_slice($tags, 0, 3));
        }

        if ($reasons === [] && $brand) {
            $reasons[] = 'Značka originálu: '.$brand;
        }

        return array_values(array_unique(array_filter($reasons, static fn ($v) => is_string($v) && trim($v) !== '')));
    }

    private function resolveBrandFromContext(array $context): ?string
    {
        $filters = Arr::get($context, 'filter_parameters', []);
        foreach ($filters as $filter) {
            if (! is_array($filter)) {
                continue;
            }
            $slug = Str::lower((string) ($filter['slug'] ?? $filter['name'] ?? ''));
            if ($slug === '' || ! str_contains($slug, 'znacka')) {
                continue;
            }
            foreach ($filter['values'] ?? [] as $value) {
                if (is_string($value) && trim($value) !== '') {
                    return trim($value);
                }
            }
        }

        return null;
    }

    private function computeFallbackMatches(array $baseContext, array $candidateContext): array
    {
        $matches = [
            'descriptors' => [],
            'filters' => [],
        ];

        $baseDescriptors = Arr::get($baseContext, 'descriptors', []);
        $candidateDescriptors = Arr::get($candidateContext, 'descriptors', []);
        $baseInspiration = array_values(array_unique(array_merge(
            $baseDescriptors['inspired'] ?? [],
            $baseDescriptors['similar'] ?? []
        )));
        $candidateInspiration = array_values(array_unique(array_merge(
            $candidateDescriptors['inspired'] ?? [],
            $candidateDescriptors['similar'] ?? []
        )));
        $inspirationIntersection = array_values(array_intersect($baseInspiration, $candidateInspiration));
        if ($inspirationIntersection !== []) {
            $matches['descriptors'][] = [
                'type' => 'inspiration',
                'values' => $inspirationIntersection,
            ];
        }

        $baseFilters = Arr::get($baseContext, 'filter_parameters', []);
        $candidateFilters = Arr::get($candidateContext, 'filter_parameters', []);
        foreach ($baseFilters as $slug => $filter) {
            if (! is_array($filter)) {
                continue;
            }
            $candidateFilter = $candidateFilters[$slug] ?? null;
            if (! is_array($candidateFilter)) {
                continue;
            }

            $baseValues = array_filter($filter['values'] ?? [], static fn ($v) => is_string($v) || is_numeric($v));
            $candidateValues = array_filter($candidateFilter['values'] ?? [], static fn ($v) => is_string($v) || is_numeric($v));
            $intersection = array_values(array_intersect($baseValues, $candidateValues));
            if ($intersection === []) {
                continue;
            }

            $slugNormalized = Str::lower((string) $slug);
            $name = (string) ($filter['name'] ?? $slug);
            $type = 'filter';
            if (str_contains($slugNormalized, 'znacka')) {
                $type = 'brand';
            } elseif (str_contains($slugNormalized, 'pohl') || str_contains($slugNormalized, 'gender')) {
                $type = 'gender';
            }

            $matches['filters'][] = [
                'name' => $name,
                'values' => $intersection,
                'type' => $type,
            ];
        }

        return $matches;
    }

    private function cloneWidgetWithItems(ProductWidget $template, Collection $items, ?string $containerId): ProductWidget
    {
        $widget = $template->replicate();
        $widget->id = (string) Str::uuid();
        $widget->public_token = 'auto-recommendations-'.$widget->id;
        $widget->setRelation('items', $items->values());

        $settings = is_array($template->settings) ? $template->settings : [];
        if ($containerId) {
            $settings['container_id'] = $containerId;
        }

        $widget->settings = $settings;

        return $widget;
    }

    private function resolveMiniImageUrl(?array $option, array $snapshot, ?array $recommendation = null, ?ProductVariant $variant = null): ?string
    {
        $productPayload = $variant?->product?->base_payload;
        $variantData = is_array($variant?->data) ? $variant->data : [];
        $payloadMeta = is_array($productPayload) ? Arr::get($productPayload, 'metadata', []) : [];

        $candidates = [
            $option['mini_image_url'] ?? ($option['miniImageUrl'] ?? null),
            $option['mini_image'] ?? null,
            Arr::get($variantData, 'original_image'),
            Arr::get($variantData, 'originalImage'),
            Arr::get($variantData, 'original_image_url'),
            Arr::get($variantData, 'originalImageUrl'),
            Arr::get($variantData, 'inspiration_image'),
            Arr::get($variantData, 'inspirationImage'),
            Arr::get($variantData, 'inspiration_image_url'),
            Arr::get($variantData, 'inspirationImageUrl'),
            Arr::get($variantData, 'mini_image_url'),
            Arr::get($variantData, 'mini_image'),
            Arr::get($variantData, 'miniImageUrl'),
            Arr::get($variantData, 'miniImage'),
            Arr::get($recommendation, 'variant.data.original_image'),
            Arr::get($recommendation, 'variant.data.originalImage'),
            Arr::get($recommendation, 'variant.data.original_image_url'),
            Arr::get($recommendation, 'variant.data.originalImageUrl'),
            Arr::get($recommendation, 'variant.data.inspiration_image'),
            Arr::get($recommendation, 'variant.data.inspirationImage'),
            Arr::get($recommendation, 'variant.data.inspiration_image_url'),
            Arr::get($recommendation, 'variant.data.inspirationImageUrl'),
            Arr::get($recommendation, 'variant.data.mini_image_url'),
            Arr::get($recommendation, 'variant.data.miniImageUrl'),
            Arr::get($recommendation, 'variant.data.mini_image'),
            Arr::get($recommendation, 'variant.data.miniImage'),
            Arr::get($payloadMeta, 'original_image'),
            Arr::get($payloadMeta, 'originalImage'),
            Arr::get($payloadMeta, 'original_image_url'),
            Arr::get($payloadMeta, 'originalImageUrl'),
            Arr::get($payloadMeta, 'inspiration_image'),
            Arr::get($payloadMeta, 'inspirationImage'),
            Arr::get($payloadMeta, 'inspiration_image_url'),
            Arr::get($payloadMeta, 'inspirationImageUrl'),
            Arr::get($payloadMeta, 'mini_image_url'),
            Arr::get($payloadMeta, 'miniImageUrl'),
            Arr::get($payloadMeta, 'mini_image'),
            Arr::get($payloadMeta, 'miniImage'),
            is_array($productPayload) ? Arr::get($productPayload, 'original_image') : null,
            is_array($productPayload) ? Arr::get($productPayload, 'originalImage') : null,
            is_array($productPayload) ? Arr::get($productPayload, 'original_image_url') : null,
            is_array($productPayload) ? Arr::get($productPayload, 'originalImageUrl') : null,
            is_array($productPayload) ? Arr::get($productPayload, 'inspiration_image') : null,
            is_array($productPayload) ? Arr::get($productPayload, 'inspirationImage') : null,
            is_array($productPayload) ? Arr::get($productPayload, 'inspiration_image_url') : null,
            is_array($productPayload) ? Arr::get($productPayload, 'inspirationImageUrl') : null,
            is_array($productPayload) ? Arr::get($productPayload, 'inspired_image') : null,
            is_array($productPayload) ? Arr::get($productPayload, 'inspiredImage') : null,
            is_array($productPayload) ? Arr::get($productPayload, 'mini_image_url') : null,
            is_array($productPayload) ? Arr::get($productPayload, 'miniImageUrl') : null,
            is_array($productPayload) ? Arr::get($productPayload, 'mini_image') : null,
            is_array($productPayload) ? Arr::get($productPayload, 'miniImage') : null,
            Arr::get($snapshot, 'metadata.original_image'),
            Arr::get($snapshot, 'metadata.original_image_url'),
            Arr::get($snapshot, 'metadata.inspiration_image'),
            Arr::get($snapshot, 'metadata.inspiration_image_url'),
            Arr::get($snapshot, 'images.1.url'),
            Arr::get($snapshot, 'images.1'),
            Arr::get($snapshot, 'images.0.url'),
            Arr::get($snapshot, 'images.0'),
        ];

        foreach ($candidates as $candidate) {
            $url = $this->normalizeUrl($candidate);
            if ($url) {
                return $url;
            }
        }

        return null;
    }

    private function buildSubtitle(array $snapshot, array $recommendation, ?array $option, array $productPayload = []): string
    {
        $subtitleCandidates = [
            Arr::get($snapshot, 'name_appendix'),
            Arr::get($snapshot, 'nameAppendix'),
            Arr::get($snapshot, 'additional_name'),
            Arr::get($snapshot, 'additionalName'),
            Arr::get($productPayload, 'additional_name'),
            Arr::get($productPayload, 'additionalName'),
            Arr::get($snapshot, 'metadata.additional_name'),
            Arr::get($snapshot, 'metadata.additionalName'),
            Arr::get($productPayload, 'metadata.additional_name'),
            Arr::get($productPayload, 'metadata.additionalName'),
            Arr::get($snapshot, 'metadata.subtitle'),
            Arr::get($snapshot, 'metadata.product_subtitle'),
            Arr::get($snapshot, 'metadata.name_appendix'),
            Arr::get($snapshot, 'metadata.nameAppendix'),
            Arr::get($snapshot, 'metadata.doplnek_k_nazvu'),
            Arr::get($snapshot, 'metadata.doplněk_k_názvu'),
            Arr::get($recommendation, 'variant.subtitle'),
            Arr::get($recommendation, 'variant.data.subtitle'),
            Arr::get($recommendation, 'variant.data.additionalName'),
            Arr::get($recommendation, 'variant.data.additional_name'),
            Arr::get($recommendation, 'variant.data.nameAppendix'),
            Arr::get($recommendation, 'variant.data.name_appendix'),
            Arr::get($option, 'additional_name'),
            Arr::get($option, 'additionalName'),
        ];

        foreach ($subtitleCandidates as $candidate) {
            $sanitized = $this->sanitizeSubtitleCandidate($candidate);
            if ($sanitized !== null) {
                return $sanitized;
            }
        }

        // Do not fall back to full description; keep subtitle concise.

        $volume = $this->stripSizePrefix(
            $option['volume'] ?? Arr::get($recommendation, 'variant.data.volume.value')
        );
        if ($volume) {
            return $volume;
        }

        return '';
    }

    /**
     * @return array{brand: ?string, title: ?string}
     */
    private function extractInspiration(array $context, array $snapshot, array $recommendation): array
    {
        $storeBrand = $this->normalizeString(Arr::get($recommendation, 'variant.brand'));
        $storeTitle = $this->normalizeString(Arr::get($recommendation, 'variant.name'));

        $brandCandidates = [];
        $titleCandidates = [];

        $pushBrand = function (?string $value) use (&$brandCandidates): void {
            if ($value === null) {
                return;
            }
            $normalized = $this->normalizeString($value);
            if ($normalized !== null) {
                $brandCandidates[] = $normalized;
            }
        };

        $pushTitle = function (?string $value) use (&$titleCandidates): void {
            if ($value === null) {
                return;
            }
            $normalized = $this->normalizeString($value);
            if ($normalized !== null) {
                $titleCandidates[] = $normalized;
            }
        };

        $pushPair = function (?string $value) use (&$brandCandidates, &$titleCandidates): void {
            if ($value === null) {
                return;
            }
            $normalized = $this->normalizeString($value);
            if ($normalized === null) {
                return;
            }
            [$detectedBrand, $detectedTitle] = $this->splitInspirationLabel($normalized);
            if ($detectedBrand) {
                $brandCandidates[] = $detectedBrand;
            }
            if ($detectedTitle) {
                $titleCandidates[] = $detectedTitle;
            }
        };

        foreach ((array) Arr::get($context, 'descriptor_items.inspired', []) as $item) {
            if (is_array($item)) {
                $pushPair($item['value'] ?? null);
                $pushPair($item['label'] ?? null);
            } elseif (is_string($item)) {
                $pushPair($item);
            }
        }

        foreach ((array) Arr::get($context, 'descriptors.inspired', []) as $value) {
            if (is_string($value)) {
                $pushPair($value);
            }
        }

        foreach ((array) Arr::get($context, 'descriptor_items.similar', []) as $item) {
            if (is_array($item)) {
                $pushPair($item['value'] ?? null);
                $pushPair($item['label'] ?? null);
            } elseif (is_string($item)) {
                $pushPair($item);
            }
        }

        foreach ((array) Arr::get($context, 'descriptors.similar', []) as $value) {
            if (is_string($value)) {
                $pushPair($value);
            }
        }

        $metadata = Arr::get($snapshot, 'metadata', []);
        if (is_array($metadata)) {
            $pushPair($metadata['original_name'] ?? null);
            $pushPair($metadata['nazev_originalu'] ?? null);
                        $pushPair($metadata['inspired_by'] ?? null);
            $pushPair($metadata['inspired_by_title'] ?? null);
            $pushBrand($metadata['original_brand'] ?? null);
            $pushBrand($metadata['brand_original'] ?? null);
            $pushBrand($metadata['inspired_by_brand'] ?? null);
        }

        foreach ((array) Arr::get($snapshot, 'parameters', []) as $parameter) {
            if (! is_array($parameter)) {
                continue;
            }
            $name = $this->normalizeString($parameter['name'] ?? $parameter['title'] ?? null);
            $normalizedName = $name ? Str::ascii(Str::lower($name)) : '';
            if ($normalizedName === '' || (! str_contains($normalizedName, 'inspiro') && ! str_contains($normalizedName, 'podob'))) {
                continue;
            }
            $values = $parameter['values'] ?? [];
            if (is_array($values)) {
                foreach ($values as $value) {
                    if (is_string($value)) {
                        $pushPair($value);
                    } elseif (is_array($value)) {
                        $pushPair($value['value'] ?? $value['name'] ?? null);
                    }
                }
            } elseif (is_string($values)) {
                $pushPair($values);
            }
        }

        $variantData = Arr::get($recommendation, 'variant.data', []);
        if (is_array($variantData)) {
            $pushPair($variantData['original_name'] ?? null);
            $pushPair($variantData['originalName'] ?? null);
            $pushPair($variantData['inspired_by_title'] ?? null);
            $pushBrand($variantData['original_brand'] ?? null);
            $pushBrand($variantData['originalBrand'] ?? null);
            $pushBrand($variantData['inspired_by_brand'] ?? null);
            $pushBrand($variantData['brand'] ?? null);
            $pushBrand($variantData['brand_name'] ?? null);
            $pushBrand($variantData['brandName'] ?? null);
            $pushBrand($variantData['znacka'] ?? null);
            $pushBrand($variantData['znacka-2'] ?? null);
        }

        $filterParams = Arr::get($context, 'filter_parameters', []);
        foreach ($filterParams as $slug => $meta) {
            if (! is_array($meta)) {
                continue;
            }
            $slugString = is_string($slug) ? mb_strtolower($slug, 'UTF-8') : '';
            $nameString = isset($meta['name']) ? mb_strtolower((string) $meta['name'], 'UTF-8') : '';
            if (! str_contains($slugString, 'znacka') && ! str_contains($nameString, 'znacka')) {
                continue;
            }
            foreach ($meta['values'] ?? [] as $candidateValue) {
                if (is_string($candidateValue)) {
                    $pushBrand($candidateValue);
                }
            }
        }

        $matchesDescriptors = Arr::get($recommendation, 'matches.descriptors', []);
        if (is_array($matchesDescriptors)) {
            foreach ($matchesDescriptors as $matchEntry) {
                if (! is_array($matchEntry)) {
                    continue;
                }

                $values = $matchEntry['values'] ?? [];
                if (! is_array($values)) {
                    continue;
                }

                foreach ($values as $value) {
                    $pushPair(is_string($value) ? $value : null);
                }
            }
        }

        $pushPair($storeTitle);
        $pushBrand($storeBrand);

        $brandCandidates = array_values(array_filter($brandCandidates, function ($candidate) {
            if ($candidate === null || $candidate === '') {
                return false;
            }
            $value = is_string($candidate) ? $candidate : (string) $candidate;
            return ! $this->isMeasurementLabel($value);
        }));

        $titleCandidates = array_values(array_filter($titleCandidates, function ($candidate) {
            if ($candidate === null || $candidate === '') {
                return false;
            }
            $value = is_string($candidate) ? $candidate : (string) $candidate;
            return ! $this->isMeasurementLabel($value);
        }));

        $brandCandidates = array_values(array_unique($brandCandidates, SORT_REGULAR));
        $titleCandidates = array_values(array_unique($titleCandidates, SORT_REGULAR));

        $brandFromTitleHints = $this->detectBrandFromTitleHints(array_merge($titleCandidates, [$storeTitle]));
        if ($brandFromTitleHints) {
            array_unshift($brandCandidates, $brandFromTitleHints);
            $brandCandidates = array_values(array_unique($brandCandidates, SORT_REGULAR));
        }
        $knownBrand = $this->detectKnownBrandToken(array_merge([$storeTitle, $storeBrand], $brandCandidates, $titleCandidates));
        if ($knownBrand) {
            array_unshift($brandCandidates, $knownBrand);
            $brandCandidates = array_values(array_unique($brandCandidates, SORT_REGULAR));
        }

        $storeBrandFormatted = $this->formatBrandName($storeBrand);
        $storeBrandComparable = $this->normalizeComparableString($storeBrandFormatted);

        $brand = null;
        foreach ($brandCandidates as $candidate) {
            if ($this->isInvalidBrandToken($candidate)) {
                continue;
            }
            $comparable = $this->normalizeComparableString($candidate);
            if ($comparable === null) {
                continue;
            }
            if ($storeBrandComparable !== null && $comparable === $storeBrandComparable) {
                continue;
            }
            $formattedCandidate = $this->formatBrandName($candidate);
            if ($formattedCandidate === null) {
                continue;
            }
            $brand = $formattedCandidate;
            break;
        }

        if (! $brand) {
            $brand = $this->formatBrandName($knownBrand ?: ($brandCandidates[0] ?? $storeBrandFormatted));
        }

        $title = null;
        foreach ($titleCandidates as $candidate) {
            if ($candidate !== null && $candidate !== '') {
                $title = $candidate;
                break;
            }
        }

        if (! $title) {
            $title = $storeTitle;
        }

        $brandFromTitles = $this->formatBrandName(
            $this->detectKnownBrandToken(array_merge($titleCandidates, [$title, $storeTitle]))
        );

        if ($brandFromTitles && ! $this->isLocalBrand($brandFromTitles, $storeBrandFormatted)) {
            $brand = $brandFromTitles;
        }

        if ($brand && $this->isLocalBrand($brand, $storeBrandFormatted)) {
            $fallbackBrand = $this->formatBrandName(
                $this->detectKnownBrandToken(array_merge($titleCandidates, [$storeTitle ?? '', $title ?? '']))
            );
            if ($fallbackBrand && ! $this->isLocalBrand($fallbackBrand, $storeBrandFormatted)) {
                $brand = $fallbackBrand;
            }
        }

        if (! $brand) {
            $brand = $storeBrandFormatted;
        }

        // Hard override: if we ended with CK but title hints contain "opium", use YSL.
        $titleNormalized = $this->normalizeComparableString($titleCandidates[0] ?? $storeTitle ?? $title ?? null);
        if ($brand && $this->normalizeComparableString($brand) === 'CK') {
            if (is_string($titleNormalized) && str_contains($titleNormalized, 'opium')) {
                $brand = 'YSL';
            }
        }

        $cleanedTitle = $this->removeBrandFromTitle($title, $brand);

        if ($cleanedTitle === null) {
            foreach ($titleCandidates as $candidate) {
                $candidateClean = $this->removeBrandFromTitle($candidate, $brand);
                if ($candidateClean !== null) {
                    $cleanedTitle = $candidateClean;
                    break;
                }
            }
        }

        if ($cleanedTitle === null) {
            $cleanedTitle = $this->removeBrandFromTitle($storeTitle, $brand);
        }

        if ($cleanedTitle === null) {
            foreach ($titleCandidates as $candidate) {
                if ($candidate !== null && $candidate !== '' && ! $this->isMeasurementLabel($candidate)) {
                    $cleanedTitle = $candidate;
                    break;
                }
            }
        }

        if ($cleanedTitle !== null && $this->isMeasurementLabel($cleanedTitle)) {
            $cleanedTitle = null;
        }

        $fallbackTitle = $title ?? $storeTitle ?? '';
        $title = $cleanedTitle ?? $fallbackTitle;

        return [
            'brand' => $brand,
            'title' => $title,
        ];
    }

    private function splitInspirationLabel(string $value): array
    {
        $clean = preg_replace('/\s+/u', ' ', trim($value));
        if ($clean === '') {
            return [null, null];
        }

        $words = preg_split('/\s+/u', $clean);
        if (! is_array($words) || $words === []) {
            return [null, $clean];
        }

        $normalizedWords = array_map(
            static fn ($token) => Str::lower(Str::ascii($token)),
            $words
        );

        $multiWordBrands = [
            ['paco', 'rabanne'],
            ['yves', 'saint', 'laurent'],
            ['giorgio', 'armani'],
            ['dolce', 'gabbana'],
            ['jean', 'paul', 'gaultier'],
            ['carolina', 'herrera'],
            ['ralph', 'lauren'],
            ['estee', 'lauder'],
            ['victor', 'rolf'],
            ['viktor', 'rolf'],
            ['van', 'cleef', 'arpels'],
            ['elizabeth', 'arden'],
            ['antonio', 'banderas'],
            ['bruno', 'banani'],
            ['jo', 'malone'],
            ['issey', 'miyake'],
            ['salvatore', 'ferragamo'],
            ['jean', 'paul'],
            ['john', 'richmond'],
        ];

        foreach ($multiWordBrands as $candidateTokens) {
            $length = count($candidateTokens);
            if ($length >= count($words)) {
                continue;
            }
            if (array_slice($normalizedWords, 0, $length) === $candidateTokens) {
                $brand = trim(implode(' ', array_slice($words, 0, $length)));
                $title = trim(implode(' ', array_slice($words, $length)));

                return [$brand ?: null, $title ?: null];
            }
        }

        if (str_contains($clean, '-')) {
            [$maybeBrand, $maybeTitle] = array_map('trim', explode('-', $clean, 2));
            return [$maybeBrand ?: null, $maybeTitle ?: null];
        }

        $wordCount = count($words);
        if ($wordCount === 1) {
            return [null, $clean];
        }

        $firstToken = $words[0];
        $lastToken = $words[$wordCount - 1];

        $lowerFirst = $normalizedWords[0];
        $lowerLast = $normalizedWords[$wordCount - 1];

        if ($lowerFirst !== '' && $lowerFirst === $lowerLast) {
            return [
                $firstToken,
                trim(implode(' ', array_slice($words, 1))) ?: null,
            ];
        }

        $connectors = [
            'de', 'du', 'des', 'le', 'la', 'les', 'pour', 'for', 'the',
            'and', 'of', 'da', 'do', 'dos', 'das', 'del', 'della', 'delle',
            'di', 'al', 'el', 'en', 'by', 'avec', 'avec.', 'ao',
        ];

        if (isset($normalizedWords[1]) && in_array($normalizedWords[1], $connectors, true)) {
            return [
                $firstToken,
                trim(implode(' ', array_slice($words, 1))) ?: null,
            ];
        }

        if ($wordCount >= 4 && mb_strlen($words[1]) <= 3) {
            return [
                $firstToken,
                trim(implode(' ', array_slice($words, 1))) ?: null,
            ];
        }

        if ($wordCount >= 3 && isset($normalizedWords[$wordCount - 2]) && in_array($normalizedWords[$wordCount - 2], $connectors, true)) {
            $brandSlice = array_slice($words, 0, $wordCount - 2);
            $titleSlice = array_slice($words, $wordCount - 2);

            return [
                trim(implode(' ', $brandSlice)) ?: null,
                trim(implode(' ', $titleSlice)) ?: null,
            ];
        }

        if ($wordCount === 2) {
            return [$words[0], $words[1]];
        }

        return [
            $words[0],
            trim(implode(' ', array_slice($words, 1))) ?: null,
        ];
    }

    private function detectBrandFromTitleHints(array $titles): ?string
    {
        $hints = [
            'black opium' => 'Yves Saint Laurent',
            'opium' => 'Yves Saint Laurent',
            'vuitton' => 'Louis Vuitton',
        ];

        foreach ($titles as $title) {
            if (! is_string($title)) {
                continue;
            }
            $normalized = Str::lower(Str::ascii($title));
            foreach ($hints as $needle => $brand) {
                if (str_contains($normalized, $needle)) {
                    return $brand;
                }
            }
        }

        return null;
    }

    private function extractTags(array $context, array $snapshot, array $recommendation): array
    {
        $candidates = [];

        $push = static function (?string $value) use (&$candidates): void {
            if (! $value) {
                return;
            }
            $normalized = trim($value);
            if ($normalized === '') {
                return;
            }
            if (! in_array($normalized, $candidates, true)) {
                $candidates[] = $normalized;
            }
        };

        $filterParameters = Arr::get($context, 'filter_parameters', []);
        foreach ($filterParameters as $slug => $meta) {
            if (! is_array($meta) || empty($meta['values'])) {
                continue;
            }

            $normalizedSlug = (string) $slug;
            if (
                str_contains($normalizedSlug, 'druh-vune') ||
                str_contains($normalizedSlug, 'vune') ||
                str_contains($normalizedSlug, 'dominantni') ||
                str_contains($normalizedSlug, 'ingredien')
            ) {
                foreach ($meta['values'] as $value) {
                    if (is_string($value)) {
                        $push($value);
                    }
                }
            }
        }

        $recommendationTags = Arr::get($recommendation, 'variant.tags', []);
        if (is_array($recommendationTags)) {
            foreach ($recommendationTags as $tagEntry) {
                if (is_array($tagEntry) && isset($tagEntry['name'])) {
                    $push($tagEntry['name']);
                } elseif (is_string($tagEntry)) {
                    $push($tagEntry);
                }
            }
        }

        $parameters = Arr::get($snapshot, 'parameters', []);
        if (is_array($parameters)) {
            foreach ($parameters as $parameter) {
                if (! is_array($parameter)) {
                    continue;
                }
                if (! empty($parameter['values']) && is_array($parameter['values'])) {
                    foreach ($parameter['values'] as $value) {
                        if (is_string($value)) {
                            $push($value);
                        }
                    }
                }
            }
        }

        return array_slice($candidates, 0, 3);
    }

    private function buildVariantOptions(array $options, string $currency, ?string $brand, ?string $title): array
    {
        $result = [];

        foreach ($options as $option) {
            if (! is_array($option)) {
                continue;
            }

            $stockLevel = $option['stock_level'] ?? $option['stock'] ?? null;
            if (is_numeric($stockLevel) && (float) $stockLevel <= 0.0) {
                continue;
            }

            $excludeCandidates = [
                $option['title'] ?? null,
                $option['variant_title'] ?? null,
                $option['label'] ?? null,
                $option['code'] ?? null,
                $option['volume'] ?? null,
                $option['variant_size'] ?? null,
                $option['variant_size_label'] ?? null,
            ];
            $shouldExclude = false;
            foreach ($excludeCandidates as $candidate) {
                if (! is_string($candidate) || $candidate === '') {
                    continue;
                }
                $normalized = Str::lower($candidate);
                foreach (self::EXCLUDE_KEYWORDS as $keyword) {
                    $needle = Str::lower($keyword);
                    if ($needle !== '' && Str::contains($normalized, $needle)) {
                        $shouldExclude = true;
                        break 2;
                    }
                }
            }

            if ($shouldExclude) {
                continue;
            }

            $priceCurrent = $this->formatPriceValue($option['price'] ?? null);
            $priceOriginal = $this->formatPriceValue($option['original_price'] ?? null);
            $label = $this->sanitizeVariantLabel($option['label'] ?? $option['code'] ?? null);
            $volume = $this->stripSizePrefix($option['volume'] ?? null);
            $displaySize = $volume ?? $label;
            if (! $this->looksLikeVolume($displaySize)) {
                $displaySize = null;
            }
            if (! $this->looksLikeVolume($volume)) {
                $volume = null;
            }
            $variantTitle = $this->sanitizeVariantLabel($option['title'] ?? $option['variant_title'] ?? $label);
            $variantDetailUrl = $this->normalizeUrl($option['detail_url'] ?? $option['variant_detail_url'] ?? $option['url'] ?? null);
            $variantImage = $this->normalizeUrl($option['image_url'] ?? $option['image'] ?? null);
            $variantMiniImage = $this->normalizeUrl($option['mini_image_url'] ?? $option['miniImageUrl'] ?? null);

            $result[] = array_filter([
                'variant_id' => $option['id'] ?? null,
                'id' => $option['id'] ?? null,
                'code' => $option['code'] ?? null,
                'label' => $label ?? ($option['code'] ?? null),
                'variant_title' => $variantTitle,
                'variant_size' => $displaySize,
                'display_size' => $displaySize,
                'volume' => $volume,
                'variant_price' => $priceCurrent,
                'variant_price_display' => $this->formatPriceDisplay($priceCurrent, $currency),
                'variant_original_price' => $priceOriginal,
                'variant_original_price_display' => $this->formatPriceDisplay($priceOriginal, $currency),
                'detail_url' => $variantDetailUrl,
                'variant_url' => $variantDetailUrl,
                'variant_detail_url' => $variantDetailUrl,
                'variant_image' => $variantImage,
                'variant_mini_image' => $variantMiniImage,
                'inspired_by_brand' => $brand,
                'inspired_by_title' => $title,
            ], static fn ($value) => $value !== null && $value !== '');
        }

        return $result;
    }

    private function detectGender(array $context, array $snapshot, array $recommendation): string
    {
        $candidates = [];
        $hasExplicit = false;
        $add = static function ($value) use (&$candidates, &$hasExplicit): void {
            if (is_string($value)) {
                $trimmed = trim(mb_strtolower($value, 'UTF-8'));
                if ($trimmed !== '') {
                    $candidates[] = $trimmed;
                    $hasExplicit = true;
                }
            }
        };

        $filterParameters = Arr::get($context, 'filter_parameters', []);
        foreach ($filterParameters as $slug => $meta) {
            if (! is_array($meta) || empty($meta['values'])) {
                continue;
            }
            if (str_contains((string) $slug, 'pohl') || str_contains((string) $slug, 'gender')) {
                foreach ($meta['values'] as $value) {
                    $add($value);
                }
            }
        }

        $variantData = Arr::get($recommendation, 'variant.data', []);
        if (is_array($variantData)) {
            foreach (['gender', 'sex'] as $key) {
                if (! empty($variantData[$key])) {
                    $add((string) $variantData[$key]);
                }
            }
        }

        // If we did not find explicit gender info, treat as unknown.
        if (! $hasExplicit) {
            return 'unknown';
        }

        foreach ($candidates as $candidate) {
            if (str_contains($candidate, 'unisex') || str_contains($candidate, 'obě') || str_contains($candidate, 'oboje')) {
                return 'unisex';
            }
            if (
                str_contains($candidate, 'dám') ||
                str_contains($candidate, 'žen') ||
                str_contains($candidate, 'lady') ||
                str_contains($candidate, 'female')
            ) {
                return 'female';
            }
            if (
                str_contains($candidate, 'pán') ||
                str_contains($candidate, 'muž') ||
                str_contains($candidate, 'man') ||
                str_contains($candidate, 'male')
            ) {
                return 'male';
            }
        }

        return 'unknown';
    }

    private function formatPriceDisplay(?int $value, string $currency): ?string
    {
        if ($value === null) {
            return null;
        }

        $symbol = match (Str::upper($currency)) {
            'CZK', 'KÄŚ', 'KČ' => 'Kč',
            default => $currency,
        };

        return sprintf('%d %s', $value, $symbol);
    }

    private function resolveImageUrl(?array $option, array $snapshot): ?string
    {
        $candidates = [
            $option['image_url'] ?? null,
            Arr::get($snapshot, 'images.0.url'),
            Arr::get($snapshot, 'images.0'),
        ];

        foreach ($candidates as $candidate) {
            $url = $this->normalizeUrl($candidate);
            if ($url) {
                return $url;
            }
        }

        return null;
    }

    private function normalizeUrl(mixed $value): ?string
    {
        if (is_string($value) && trim($value) !== '') {
            return $value;
        }

        return null;
    }

    private function normalizeString(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $decoded = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $trimmed = trim($decoded);

        return $trimmed === '' ? null : $trimmed;
    }

    private function formatPriceValue(mixed $value): ?int
    {
        if ($value === null) {
            return null;
        }

        if (is_numeric($value)) {
            return (int) round((float) $value);
        }

        $numeric = preg_replace('/[^0-9]/', '', (string) $value);

        return $numeric === '' ? null : (int) $numeric;
    }

    private function sanitizeVariantLabel(mixed $value): ?string
    {
        if (! is_string($value) && ! is_numeric($value)) {
            return null;
        }

        $label = strip_tags((string) $value);
        $label = preg_replace('/\s+/u', ' ', $label);
        if ($label === null) {
            return null;
        }

        $label = trim($label);
        if ($label === '') {
            return null;
        }

        $stripped = $this->stripSizePrefix($label);
        if ($stripped !== null) {
            $label = $stripped;
        }

        return $label === '' ? null : $label;
    }

    private function stripSizePrefix(mixed $value): ?string
    {
        if (! is_string($value) && ! is_numeric($value)) {
            return null;
        }

        $text = strip_tags((string) $value);
        $text = preg_replace('/^\s*(velikost|size)\s*[:=\-]?\s*/iu', '', $text);
        if ($text === null) {
            return null;
        }

        $text = trim(preg_replace('/\s+/u', ' ', $text) ?? '');
        return $text === '' ? null : $text;
    }

    private function sanitizeSubtitleCandidate(mixed $value): ?string
    {
        if (! is_string($value) && ! is_numeric($value)) {
            return null;
        }

        $text = strip_tags((string) $value);
        $text = preg_replace('/[\r\n]+/u', ' ', $text);
        $text = preg_replace('/\s+/u', ' ', $text);
        if ($text === null) {
            return null;
        }

        $text = trim($text);
        if ($text === '') {
            return null;
        }

        if (preg_match('/\b(const|let|var|function|return|window|document)\b/i', $text)) {
            return null;
        }

        if (strpbrk($text, '{}<>;=') !== false) {
            return null;
        }

        if (preg_match('/\b(Hlava|Srdce|Základ)\b(?!\s*[:\-])/iu', $text)) {
            return null;
        }

        if (preg_match('/\b(Hlava|Srdce|Základ)[^:,\.;]{0,40}/iu', $text)) {
            return null;
        }

        $text = preg_replace('/^\s*(Složení|Složen[íi]|Ingredients)\s*[:\-]?\s*/iu', '', $text);
        $text = preg_replace('/,?\s*(zaměňována|inspirována).*/iu', '', $text);
        if ($text === null) {
            return null;
        }

        $stripped = $this->stripSizePrefix($text);
        if ($stripped !== null) {
            $text = $stripped;
        }

        $text = trim($text);
        if ($text === '') {
            return null;
        }

        if (preg_match('/^(Složení|Složen[íi]|Ingredients)\b/iu', $text)) {
            return null;
        }

        $text = $this->limitWords($text, 8);

        if (mb_strlen($text, 'UTF-8') > 96) {
            $sentenceEnd = mb_strpos($text, '.', 0, 'UTF-8');
            if ($sentenceEnd !== false && $sentenceEnd >= 20 && $sentenceEnd <= 96) {
                $text = trim(mb_substr($text, 0, $sentenceEnd + 1, 'UTF-8'));
            }
        }

        if (mb_strlen($text, 'UTF-8') > 96) {
            return null;
        }

        return $text === '' ? null : $text;
    }

    /**
     * @param  array<int, string>  $tags
     */
    private function resolveHighlightTags(array $tags, array $matches): array
    {
        if ($tags === []) {
            return [];
        }

        $tagMap = [];
        foreach ($tags as $tag) {
            if (! is_string($tag)) {
                continue;
            }
            $normalized = $this->normalizeComparableString($tag);
            if ($normalized !== null) {
                $tagMap[$normalized] = $tag;
            }
        }

        if ($tagMap === []) {
            return [];
        }

        $highlight = [];
        $collect = function ($values) use (&$highlight, $tagMap): void {
            foreach ((array) $values as $value) {
                if (! is_string($value)) {
                    continue;
                }
                $normalized = $this->normalizeComparableString($value);
                if ($normalized !== null && isset($tagMap[$normalized])) {
                    $highlight[$normalized] = $tagMap[$normalized];
                }
            }
        };

        foreach (Arr::get($matches, 'filters', []) as $filterMatch) {
            $collect($filterMatch['values'] ?? []);
        }

        foreach (Arr::get($matches, 'descriptors', []) as $descriptorMatch) {
            $collect($descriptorMatch['values'] ?? []);
        }

        return array_values($highlight);
    }

    private function shouldHighlightGender(array $matches): bool
    {
        foreach (Arr::get($matches, 'filters', []) as $filterMatch) {
            $name = Str::lower((string) ($filterMatch['name'] ?? ''));
            if ($name !== '' && (str_contains($name, 'pohl') || str_contains($name, 'gender') || str_contains($name, 'sex'))) {
                return true;
            }
        }

        foreach (Arr::get($matches, 'descriptors', []) as $descriptorMatch) {
            $type = Str::lower((string) ($descriptorMatch['type'] ?? ''));
            if ($type !== '' && (str_contains($type, 'pohl') || str_contains($type, 'gender'))) {
                return true;
            }
        }

        return false;
    }

    private function normalizeComparableString(?string $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $ascii = Str::ascii($value);
        $lower = Str::lower($ascii);
        $clean = preg_replace('/[^a-z0-9]+/i', ' ', $lower);
        if ($clean === null) {
            return null;
        }

        $normalized = trim(preg_replace('/\s+/u', ' ', $clean) ?? '');

        return $normalized === '' ? null : $normalized;
    }

    private function isVisibleStatus(?string $status): bool
    {
        if ($status === null) {
            return true;
        }

        $normalized = $this->normalizeComparableString($status);
        if ($normalized === null) {
            return true;
        }

        $visibleStatuses = ['visible', 'shown', 'active', 'published', 'displayed'];
        $hiddenStatuses = ['hidden', 'inactive', 'disabled', 'private', 'blocked', 'draft', 'unlisted', 'not_listed', 'unavailable'];

        if (in_array($normalized, $visibleStatuses, true)) {
            return true;
        }

        if (in_array($normalized, $hiddenStatuses, true)) {
            return false;
        }

        return true;
    }

    private function detectKnownBrandToken(array $sources): ?string
    {
        foreach ($sources as $source) {
            $value = $this->normalizeString($source ?? null);
            if ($value === null) {
                continue;
            }
            $upper = mb_strtoupper($value, 'UTF-8');
            foreach (self::KNOWN_BRANDS as $brand) {
                if ($brand !== '' && str_contains($upper, $brand)) {
                    return $brand;
                }
            }
        }

        return null;
    }

    private function removeBrandFromTitle(?string $title, ?string $brand): ?string
    {
        $normalized = $this->normalizeString($title);
        if ($normalized === null) {
            return null;
        }

        $working = $normalized;
        $tokens = [];

        if ($brand) {
            $tokens[] = $brand;
            $parts = preg_split('/\s+/u', $brand) ?: [];
            foreach ($parts as $part) {
                if ($part !== '') {
                    $tokens[] = $part;
                }
            }
        }

        $tokens = array_merge($tokens, self::KNOWN_BRANDS);

        $tokens = array_values(array_unique(array_filter($tokens, static function ($token) {
            return is_string($token) && trim($token) !== '';
        })));

        foreach ($tokens as $token) {
            $pattern = '/\b' . preg_quote($token, '/') . '\b/iu';
            $cleaned = preg_replace($pattern, '', $working);
            if ($cleaned === null) {
                $cleaned = $working;
            }
            if ($cleaned === $working) {
                $cleaned = str_ireplace($token, '', $working);
            }
            $working = $cleaned;
        }

        $working = trim(preg_replace('/\s{2,}/u', ' ', $working) ?? '');

        if ($working === '' || $this->isMeasurementLabel($working)) {
            return null;
        }

        return $working;
    }

    private function isMeasurementLabel(?string $value): bool
    {
        if ($value === null) {
            return false;
        }

        $text = is_string($value) ? trim($value) : trim((string) $value);
        if ($text === '') {
            return false;
        }

        $upper = mb_strtoupper($text, 'UTF-8');

        foreach (self::MEASUREMENT_KEYWORDS as $keyword) {
            if ($keyword !== '' && str_contains($upper, $keyword)) {
                return true;
            }
        }

        $unitPattern = implode('|', array_map(static fn ($unit) => preg_quote($unit, '/'), self::MEASUREMENT_UNITS));

        if ($unitPattern !== '' && preg_match('/^\s*\d+([.,]\d+)?\s*(?:' . $unitPattern . ')\b/iu', $text)) {
            return true;
        }

        if ($unitPattern !== '' && preg_match('/\b(?:' . $unitPattern . ')\b/iu', $text) && preg_match('/\d/', $text)) {
            return true;
        }

        return false;
    }

    private function isInvalidBrandToken(?string $value): bool
    {
        if ($value === null) {
            return true;
        }

        if ($this->isMeasurementLabel($value)) {
            return true;
        }

        $normalized = $this->normalizeComparableString($value);
        if ($normalized === null) {
            return true;
        }

        if (str_contains($normalized, 'parfemovan') || str_contains($normalized, 'toaletn') || str_contains($normalized, 'kolins')) {
            return true;
        }

        if (strlen($normalized) <= 1) {
            return true;
        }

        return false;
    }

    private function isLocalBrand(?string $brand, ?string $storeBrandFormatted): bool
    {
        if ($brand === null || $brand === '') {
            return true;
        }

        $normalizedBrand = $this->normalizeComparableString($brand);
        if ($normalizedBrand === null) {
            return true;
        }

        if ($storeBrandFormatted) {
            $storeNormalized = $this->normalizeComparableString($storeBrandFormatted);
            if ($storeNormalized !== null && $normalizedBrand === $storeNormalized) {
                return true;
            }
        }

        foreach (self::LOCAL_BRANDS as $localBrand) {
            $localNormalized = $this->normalizeComparableString($localBrand);
            if ($localNormalized !== null && $normalizedBrand === $localNormalized) {
                return true;
            }
        }

        return false;
    }

    public static function isLocalBrandStatic(?string $brand, ?string $storeBrandFormatted): bool
    {
        $controller = app(self::class);

        return $controller->isLocalBrand($brand, $storeBrandFormatted);
    }

    private function looksLikeVolume(?string $value): bool
    {
        if (! is_string($value)) {
            return false;
        }

        $clean = trim($value);
        if ($clean === '') {
            return false;
        }

        return (bool) preg_match('/\d/', $clean);
    }

    private function limitWords(?string $value, int $limit): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $decoded = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $trimmed = trim($decoded);
        if ($trimmed === '') {
            return null;
        }

        $words = preg_split('/\s+/u', $trimmed);
        if (! is_array($words) || $words === []) {
            return null;
        }

        if (count($words) <= $limit) {
            return $trimmed;
        }

        return implode(' ', array_slice($words, 0, $limit));
    }

    private function formatBrandName(?string $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);
        if ($trimmed === '') {
            return null;
        }

        if ($this->isInvalidBrandToken($trimmed)) {
            return null;
        }

        $known = $this->detectKnownBrandToken([$trimmed]);
        if ($known) {
            return $known;
        }

        return mb_strtoupper($trimmed, 'UTF-8');
    }

    private function isExcludedVariant(ProductVariant $variant): bool
    {
        $candidates = [
            $variant->name,
            $variant->code,
            $variant->brand,
            Arr::get($variant->data ?? [], 'volume.label'),
            Arr::get($variant->data ?? [], 'volume.value'),
        ];

        foreach ($candidates as $value) {
            if (! is_string($value) || $value === '') {
                continue;
            }
            $normalized = Str::lower($value);
            foreach (self::EXCLUDE_KEYWORDS as $keyword) {
                $needle = Str::lower($keyword);
                if ($needle !== '' && Str::contains($normalized, $needle)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Best-effort fetch of original info (name + image) from the same source the admin UI uses.
     */
    private function fetchOriginalInfo(?string $variantCode): ?array
    {
        if (! $variantCode) {
            return null;
        }

        try {
            $response = Http::timeout(2.5)
                ->get('https://app.krasnevune.cz/original/originalApp.php', [
                    'productid' => $variantCode,
                ]);

            if (! $response->ok()) {
                return null;
            }

            $payload = $response->json();
            if (! is_array($payload) || $payload === []) {
                return null;
            }

            $entry = $payload[0] ?? null;
            if (! is_array($entry)) {
                return null;
            }

            return array_filter([
                'original_name' => $this->normalizeString($entry['nazev_originalu'] ?? null),
                'image_url' => $this->normalizeUrl($entry['url_fotky'] ?? null),
            ], static fn ($value) => $value !== null && $value !== '');
        } catch (\Throwable) {
            return null;
        }
    }
}
