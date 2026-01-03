@php
    use App\Constants\CurrencyMap;
    use Illuminate\Support\Arr;
    use Illuminate\Support\Str;

    /** @var \Modules\Pim\Models\ProductWidget $widget */
    /** @var \Illuminate\Support\Collection<int, array<string, mixed>> $items */
    /** @var array<string, mixed> $settings */
    /** @var string $currencySymbol */

    $heading = $settings['heading'] ?? ($settings['title'] ?? 'Podobné produkty');

    // Determine locale - use widget locale with fallback to 'cs'
    $locale = $widget->locale ?? 'cs';
    $currencySymbol = $currencySymbol ?? 'Kč';

    $extractInt = static function ($value): ?int {
        if ($value === null) {
            return null;
        }
        if (is_int($value)) {
            return $value;
        }
        if (is_float($value)) {
            return (int) round($value);
        }

        $numeric = preg_replace('/[^0-9]/', '', (string) $value);

        return $numeric === '' ? null : (int) $numeric;
    };

    $extractMoneyCents = static function ($value): ?int {
        if ($value === null) {
            return null;
        }

        // Normalize common thousand/decimal separators and remove currency symbols
        if (is_numeric($value)) {
            $numeric = (float) $value;
        } else {
            $clean = str_replace(["\xC2\xA0", ' '], '', (string) $value); // drop NBSP/space
            $clean = str_replace(',', '.', $clean);
            $clean = preg_replace('/[^0-9.\-]/', '', $clean);
            if ($clean === null || $clean === '') {
                return null;
            }
            $numeric = is_numeric($clean) ? (float) $clean : null;
        }

        if ($numeric === null) {
            return null;
        }

        return (int) round($numeric * 100);
    };

    $formatPrice = static function (?int $value, string $locale = 'cs'): ?string {
        return CurrencyMap::formatPrice($value, $locale);
    };

    $normalizeVolume = static function (?string $volume, ?string $unit, ?string $fallbackLabel) {
        $cleanVolume = $volume ?? $fallbackLabel ?? '';
        if ($cleanVolume === '') {
            return null;
        }

        if ($unit) {
            return trim(sprintf('%s %s', $cleanVolume, $unit));
        }

        return trim($cleanVolume);
    };
    $appendClasses = static function (?string $existing) {
        $base = trim((string) $existing);
        $extra = 'kv-widget-unique kv-products';

        if ($base === '') {
            return $extra;
        }

        $all = array_unique(
            array_filter(
                explode(' ', $base.' '.$extra),
                static fn ($value) => $value !== null && $value !== ''
            )
        );

        return implode(' ', $all);
    };

    $appendixInlineStyle = 'display: block; margin: 0 auto; font-size: 14px; font-weight: 500; color: #6f6f6f; line-height: 1.35; text-align: center;';

    $stripDiacritics = static function (?string $value): string {
        if ($value === null) {
            return '';
        }

        $result = (string) $value;
        if ($result === '') {
            return '';
        }

        if (class_exists('Normalizer')) {
            $normalized = \Normalizer::normalize($result, \Normalizer::FORM_D);
            if ($normalized !== false && $normalized !== null) {
                $result = $normalized;
            }
        }

        $result = preg_replace('/[\p{Mn}]+/u', '', $result);
        if ($result === null) {
            $result = (string) $value;
        }

        return $result;
    };

    $sanitizeBrandText = static function (?string $value) use ($stripDiacritics): string {
        if ($value === null) {
            return '';
        }
        $sanitized = strtolower(trim(preg_replace('/[^a-z0-9&]+/i', ' ', $stripDiacritics($value))));
        return $sanitized === null ? '' : preg_replace('/\s+/', ' ', $sanitized);
    };

    $lorealBrandMap = [
        'ysl' => 'Yves Saint Laurent',
        'yves saint laurent' => 'Yves Saint Laurent',
        'giorgio armani' => 'Armani',
        'armani' => 'Armani',
        'prada' => 'Prada',
        'valentino' => 'Valentino',
        'mugler' => 'Mugler',
        'thierry mugler' => 'Mugler',
        'viktor & rolf' => 'Viktor & Rolf',
        'viktor&rolf' => 'Viktor & Rolf',
        'diesel' => 'Diesel',
        'ralph lauren' => 'Ralph Lauren',
        'azzaro' => 'Azzaro',
        'cacharel' => 'Cacharel',
        'maison margiela' => 'Maison Margiela',
        'lancome' => 'Lancôme',
        'lancôme' => 'Lancôme',
        'atelier cologne' => 'Atelier Cologne',
    ];

    $lorealNeedles = [];
    foreach ($lorealBrandMap as $needle => $brand) {
        $lorealNeedles[] = [
            'needle' => $sanitizeBrandText($needle),
            'brand' => $brand,
        ];
    }

    $detectBrandMatch = static function (?string $value) use ($sanitizeBrandText, $lorealNeedles): ?string {
        $normalized = $sanitizeBrandText($value);
        if ($normalized === '') {
            return null;
        }

        foreach ($lorealNeedles as $entry) {
            if (!empty($entry['needle']) && str_contains($normalized, $entry['needle'])) {
                return $entry['brand'];
            }
        }

        return null;
    };

    $normalizeOptionalString = static function ($value) {
        if (is_string($value)) {
            $trimmed = trim($value);
            return $trimmed === '' ? null : $trimmed;
        }
        if (is_numeric($value)) {
            return (string) $value;
        }
        return null;
    };

    $resolveBrandCandidate = null;
    $resolveBrandCandidate = static function ($value, int $depth = 0) use (&$resolveBrandCandidate, $detectBrandMatch, $normalizeOptionalString) {
        if ($value === null) {
            return null;
        }
        if ($depth > 5) {
            return null;
        }
        if (is_string($value) || is_numeric($value)) {
            $stringValue = $normalizeOptionalString($value);
            if ($stringValue === null) {
                return null;
            }
            $mapped = $detectBrandMatch($stringValue);
            return $mapped ?? $stringValue;
        }

        if (is_array($value)) {
            $priorityKeys = ['znacka-2', 'znacka2', 'znacka', 'znacka_originalu', 'original_brand', 'originalBrand', 'brand', 'brand_name', 'brandName'];
            foreach ($priorityKeys as $key) {
                if (array_key_exists($key, $value)) {
                    $candidate = $resolveBrandCandidate($value[$key], $depth + 1);
                    if ($candidate !== null) {
                        $mappedCandidate = $detectBrandMatch($candidate);
                        return $mappedCandidate ?? $candidate;
                    }
                }
            }
            foreach ($value as $key => $candidateValue) {
                if (is_string($key)) {
                    $normalizedKey = strtolower(preg_replace('/[^a-z0-9]+/i', ' ', $key));
                    if ($normalizedKey !== null && $normalizedKey !== '') {
                        if (str_contains($normalizedKey, 'znacka') || str_contains($normalizedKey, 'brand')) {
                            $candidate = $resolveBrandCandidate($candidateValue, $depth + 1);
                            if ($candidate !== null) {
                                $mappedCandidate = $detectBrandMatch($candidate);
                                return $mappedCandidate ?? $candidate;
                            }
                        }
                        if (str_contains($normalizedKey, 'inspiro') || str_contains($normalizedKey, 'podobn') || $normalizedKey === 'desc') {
                            $candidate = $resolveBrandCandidate($candidateValue, $depth + 1);
                            if ($candidate !== null) {
                                $mappedCandidate = $detectBrandMatch($candidate);
                                if ($mappedCandidate !== null) {
                                    return $mappedCandidate;
                                }
                            }
                        }
                    }
                }
            }
            foreach ($value as $candidateValue) {
                $candidate = $resolveBrandCandidate($candidateValue, $depth + 1);
                if ($candidate !== null) {
                    $mappedCandidate = $detectBrandMatch($candidate);
                    return $mappedCandidate ?? $candidate;
                }
            }
        }

        return null;
    };

    $resolveInspiredTitle = null;
    $resolveInspiredTitle = static function ($value, ?string $brand, int $depth = 0) use (&$resolveInspiredTitle, $normalizeOptionalString, $stripDiacritics) {
        if ($value === null || $depth > 5) {
            return null;
        }
        if (is_string($value) || is_numeric($value)) {
            $stringValue = $normalizeOptionalString($value);
            if ($stringValue === null) {
                return null;
            }
            $cleaned = preg_replace('/^[\s,;:-]+/u', '', $stringValue);
            if ($cleaned === null || $cleaned === '') {
                $cleaned = $stringValue;
            }
            if ($brand) {
                $brandNormalized = strtolower($stripDiacritics($brand));
                $titleNormalized = strtolower($stripDiacritics($cleaned));
                if ($brandNormalized !== '' && str_starts_with($titleNormalized, $brandNormalized)) {
                    $brandLength = function_exists('mb_strlen') ? mb_strlen($brand, 'UTF-8') : strlen($brand);
                    if ($brandLength > 0) {
                        $cleaned = function_exists('mb_substr')
                            ? mb_substr($cleaned, $brandLength, null, 'UTF-8')
                            : substr($cleaned, $brandLength);
                        $cleaned = $cleaned === false ? '' : $cleaned;
                        $cleaned = trim((string) $cleaned);
                    }
                    $cleaned = preg_replace('/^[\s,;:-]+/u', '', $cleaned ?? '') ?? '';
                }
            }
            return $cleaned === '' ? $stringValue : $cleaned;
        }

        if (is_array($value)) {
            $priorityKeys = ['inspired_by_title', 'original_title', 'original_name', 'nazev_originalu', 'nazevOriginalu', 'desc', 'description'];
            foreach ($priorityKeys as $key) {
                if (array_key_exists($key, $value)) {
                    $candidate = $resolveInspiredTitle($value[$key], $brand, $depth + 1);
                    if ($candidate !== null) {
                        return $candidate;
                    }
                }
            }
            foreach ($value as $candidateValue) {
                $candidate = $resolveInspiredTitle($candidateValue, $brand, $depth + 1);
                if ($candidate !== null) {
                    return $candidate;
                }
            }
        }

        return null;
    };

    $containerClassComputed = $appendClasses($settings['container_class'] ?? null);
@endphp
<div
    id="{{ e($settings['container_id']) }}"
    class="{{ e($containerClassComputed) }}"
    data-kv-widget="{{ e($widget->public_token) }}"
    data-widget-items="{{ $items->count() }}"
    data-shop-id="{{ e($widget->shop_id) }}"
    data-locale="{{ e($widget->locale ?? 'cs') }}"
>
    <style>
        #{{ e($settings['container_id']) }} {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
            display: block !important;
            height: 100% !important;
        }
        #{{ e($settings['container_id']) }} > div {
            width: 100% !important;
            max-width: 100% !important;
            display: block !important;
        }
        #{{ e($settings['container_id']) }} .kv-widget-slider {
            width: 100% !important;
            max-width: 100% !important;
            padding-left: 56px;
            padding-right: 56px;
            box-sizing: border-box;
        }
        @media (max-width: 640px) {
            #{{ e($settings['container_id']) }} .kv-widget-slider {
                padding-left: 0 !important;
                padding-right: 0 !important;
            }
            .kv-widget-nav.kv-widget-prev {
                left: -20px !important;
                right: auto !important;
            }
            .kv-widget-nav.kv-widget-next {
                right: -20px !important;
                left: auto !important;
            }
        }
        #{{ e($settings['container_id']) }} .kv-widget-slide .p-in-in > a {
            text-decoration: none;
            height: 158px;
        }
        #{{ e($settings['container_id']) }} .p a.image {
            height: 150px;
            margin-bottom: 5px;
        }
        #{{ e($settings['container_id']) }} .p a.image img[data-role="product-image"] {
            height: 150px !important;
            margin-bottom: 5px !important;
        }
        #{{ e($settings['container_id']) }} .kv-widget-viewport {
            width: 100% !important;
            max-width: 100% !important;
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            touch-action: pan-x pan-y;
            scroll-snap-type: x mandatory;
        }
        #{{ e($settings['container_id']) }} .kv-widget-track {
            width: max(100%, calc((300px + 24px) * {{ max(1, min(8, $items->count())) }}));
            max-width: none;
        }
        #{{ e($settings['container_id']) }} .kv-widget-slide {
            scroll-snap-align: start;
        }
        #{{ e($settings['container_id']) }} .tags .tag::before,
        #{{ e($settings['container_id']) }} .tags .tag::after,
        #{{ e($settings['container_id']) }} .widget-parameter-list .widget-parameter-value::before,
        #{{ e($settings['container_id']) }} .widget-parameter-list .widget-parameter-value::after {
            content: none !important;
            display: none !important;
        }
        #{{ e($settings['container_id']) }} .tags .tag {
            margin-right: 2px;
            border-radius: 5px;
            background: #F3F3F3;
            padding: 4px 6px;
            color: #000;
            font-size: 13px;
            font-weight: 400;
            transition: background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
        }
        #{{ e($settings['container_id']) }} .tags {
            list-style: none;
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            padding: 0;
            margin: 12px 0 0;
            gap: 0;
        }
        #{{ e($settings['container_id']) }} .tags .kv-widget-tag-highlight {
            transform: translateY(-2px);
        }
        #{{ e($settings['container_id']) }} .widget-parameter-wrapper {
            width: 100% !important;
            bottom: 80px;
        }
        #{{ e($settings['container_id']) }} .widget-parameter-list {
            display: flex !important;
            flex-wrap: nowrap !important;
            justify-content: center;
            gap: 0 !important;
            padding: 0;
            margin: 0;
            overflow-x: auto;
        }
        #{{ e($settings['container_id']) }} .widget-parameter-list .widget-parameter-value {
            list-style: none;
            padding: 0 !important;
            margin: 0;
            border: none !important;
            display: inline-flex;
        }
        #{{ e($settings['container_id']) }} .kv-widget-slide .widget-parameter-value a {
            display: inline-block;
            min-width: 60px;
            max-width: 120px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        #{{ e($settings['container_id']) }} .widget-parameter-list .widget-parameter-value a {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            min-width: 48px;
            padding: 5px;
            border: 1px solid #259B63;
            border-radius: 0;
            font-size: 12px;
            font-weight: 500;
            color: #000000;
            text-decoration: none;
            background: #ffffff;
            transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
        }
        #{{ e($settings['container_id']) }} .widget-parameter-list .widget-parameter-value.active-variant a {
            background: #259B63;
            color: #ffffff;
            border-color: #259B63;
        }
        #{{ e($settings['container_id']) }} .widget-parameter-list .widget-parameter-value + .widget-parameter-value a {
            border-left-width: 0;
        }
        #{{ e($settings['container_id']) }} .widget-parameter-list .widget-parameter-value:first-child a {
            border-top-left-radius: 24px;
            border-bottom-left-radius: 24px;
            border-left-width: 1px;
        }
        #{{ e($settings['container_id']) }} .widget-parameter-list .widget-parameter-value:last-child a {
            border-top-right-radius: 24px;
            border-bottom-right-radius: 24px;
        }
        #{{ e($settings['container_id']) }} .widget-parameter-list .widget-parameter-value:only-child a {
            border-radius: 24px;
        }
        #{{ e($settings['container_id']) }} .widget-parameter-wrapper ul li:before,
        #{{ e($settings['container_id']) }} .tags li:before,
        #{{ e($settings['container_id']) }} .p .product ul li:before {
            content: none !important;
            display: none !important;
        }
        #{{ e($settings['container_id']) }} .widget-parameter-wrapper ul li::after,
        #{{ e($settings['container_id']) }} .tags li::after,
        #{{ e($settings['container_id']) }} .p .product ul li::after {
            content: none !important;
            display: none !important;
        }
        #{{ e($settings['container_id']) }} .p .tags {
            gap: 0;
        }
        #{{ e($settings['container_id']) }} .kv-widget-slider-dot.is-active {
            background: #1fb56b !important;
            border-color: #1fb56b !important;
        }
        #{{ e($settings['container_id']) }} .product-appendix.category-appendix {
            display: block;
            margin: 0 auto 0;
            font-size: 14px;
            font-weight: 500;
            color: #6f6f6f;
            line-height: 1.35;
            text-align: center;
            white-space: nowrap;
        }
        #{{ e($settings['container_id']) }} .product-appendix.category-appendix .changable {
            display: inline;
        }
        #{{ e($settings['container_id']) }} .brx-product .product-appendix.category-appendix {
            font-size: 14px;
            color: #757575;
            font-weight: 300;
        }
        #{{ e($settings['container_id']) }} .product-appendix.category-appendix .changable strong {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            background-repeat: no-repeat;
            background-size: cover;
            padding: 22px 12px 0 12px;
            font-size: 15px;
            font-weight: 700;
            color: #000000;
            line-height: 0.7;
            min-height: 74px;
            margin-top: 10px;
        }
        #{{ e($settings['container_id']) }} .product-appendix.category-appendix .changable strong .inspired-brand {
            text-transform: uppercase;
            font-size: 18px;
        }
        #{{ e($settings['container_id']) }} .product-appendix.category-appendix .changable strong .inspired-title {
            text-transform: none;
        }
        #{{ e($settings['container_id']) }} .match-reasons {
            list-style: none;
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 6px;
            padding: 0;
            margin: 6px 0 0;
        }
        #{{ e($settings['container_id']) }} .match-reasons .reason {
            background: rgba(31, 181, 107, 0.12);
            color: #1fb56b;
            border: 1px solid rgba(31, 181, 107, 0.4);
            border-radius: 14px;
            padding: 4px 10px;
            font-size: 11px;
            line-height: 1.2;
            white-space: nowrap;
        }
        #{{ e($settings['container_id']) }} .kv-widget-heading {
            margin: 0 0 12px 0;
            font-size: 20px;
            font-weight: 700;
            color: #000;
            text-align: center;
            line-height: 1.2;
        }

    </style>
    @if (!empty($heading ?? ''))
        <h3 class="kv-widget-heading">{{ e($heading) }}</h3>
    @endif
    <div id="reco-product-brand-erihub">
        <div class="kv-widget-slider" style="position: relative; width: 100%; box-sizing: border-box; display: flex; align-items: stretch;">
            <button
                class="kv-widget-nav kv-widget-prev is-disabled"
                type="button"
                aria-label="Předchozí produkt"
                disabled
                style="width: 44px; height: 44px; border-radius: 50%; border: 1px solid rgba(208, 213, 232, 0.8); background: #ffffff; color: #1fb56b; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease; position: absolute; top: 50%; transform: translateY(-50%); left: 8px; z-index: 2;"
            >
                <span aria-hidden="true" style="font-size: 24px; line-height: 1; font-weight: 600;">‹</span>
            </button>
            <div class="kv-widget-viewport" style="flex: 1 1 auto; width: 100%; overflow-x: auto; overflow-y: hidden;">
                <div class="kv-widget-track" style="display: flex; gap: 24px; transition: transform 0.35s ease; will-change: transform;">
                @foreach ($items as $index => $item)
                    @if (($item['mode'] ?? null) === 'raw')
                        {!! $item['raw_html'] !!}
                        @continue
                    @endif
                    @php
                        $metadata = $item['metadata'] ?? [];
                        $price = $item['price'] ?? [];
                        $buyButton = $item['buy_button'] ?? [];
                        $detailButton = $item['detail_button'] ?? [];
                        $variantOptions = $item['variant_options'] ?? [];
                        $defaultImage = $item['image_url'] ?? null;
                        $defaultMiniImage = $item['mini_image_url'] ?? null;
                        $defaultDetailUrl = $detailButton['url'] ?? ($metadata['detail_url'] ?? ($metadata['url'] ?? ($item['url'] ?? '#')));
                        $defaultVariantId = $buyButton['variant_id'] ?? null;
                        $defaultVariantCode = $buyButton['variant_code'] ?? null;
                        $defaultTitle = $item['title'] ?? '';
                        $defaultTitleColor = $item['title_color'] ?? null;
                        $defaultGender = $item['gender'] ?? null;
                        $defaultGenderIcon = $item['gender_icon_url'] ?? null;
                        $defaultInspiredBrand = $item['inspired_by_brand'] ?? null;
                        $defaultInspiredTitle = $item['inspired_by_title'] ?? null;
                        $subtitleRaw = $item['subtitle']
                            ?? $normalizeOptionalString(Arr::get($metadata, 'product_subtitle'));
                        if ($subtitleRaw) {
                            $subtitleClean = trim(preg_replace('/,\\s*(zaměňována|inspirována).*/iu', '', (string) $subtitleRaw));
                            $defaultSubtitle = $subtitleClean !== '' ? $subtitleClean : null;
                        } else {
                            $defaultSubtitle = null;
                        }
                        if (! $defaultSubtitle) {
                            $defaultSubtitle = null;
                        }
                        $isBanned = (bool) Arr::get($metadata, 'ban', false);

                        if (! $defaultInspiredBrand) {
                            $defaultInspiredBrand = $normalizeOptionalString(Arr::get($metadata, 'inspired_by_brand'));
                        }
                        if (! $defaultInspiredBrand) {
                            $defaultInspiredBrand = $normalizeOptionalString(Arr::get($metadata, 'original_brand'))
                                ?? $normalizeOptionalString(Arr::get($metadata, 'znacka-2'))
                                ?? $normalizeOptionalString(Arr::get($metadata, 'znacka2'));
                        }
                        if (! $defaultInspiredBrand) {
                            $defaultInspiredBrand = $resolveBrandCandidate($metadata);
                        }

                        if (! $defaultInspiredTitle) {
                            $defaultInspiredTitle = $normalizeOptionalString(Arr::get($metadata, 'inspired_by_title'))
                                ?? $normalizeOptionalString(Arr::get($metadata, 'original_name'))
                                ?? $normalizeOptionalString(Arr::get($metadata, 'nazev_originalu'));
                        }
                        if (! $defaultInspiredTitle) {
                            $defaultInspiredTitle = $resolveInspiredTitle($metadata, $defaultInspiredBrand);
                        }

                        $tagLabels = [];
                        if (!empty($item['tags']) && is_array($item['tags'])) {
                            $tagLabels = array_slice(array_filter($item['tags'], static fn ($tag) => is_string($tag) && trim($tag) !== ''), 0, 3);
                        } elseif (!empty($metadata['fragrance_type_reco'])) {
                            $tagLabels = array_slice(array_map('trim', explode(',', (string) $metadata['fragrance_type_reco'])), 0, 3);
                        }

                        $matchReasons = $metadata['match_reasons'] ?? [];
                        $hideMatchReasons = !empty($metadata['hide_match_reasons']);
                        $genderLabel = null;
                        if ($defaultGender === 'male') {
                            $genderLabel = 'Pánské';
                        } elseif ($defaultGender === 'female') {
                            $genderLabel = 'Dámské';
                        } elseif ($defaultGender === 'unisex') {
                            $genderLabel = 'Unisex';
                        }

                        if (! $hideMatchReasons && $matchReasons === [] && !empty($metadata['highlight_tags']) && is_array($metadata['highlight_tags'])) {
                            $matchReasons[] = 'Shodné tóny: '.implode(', ', $metadata['highlight_tags']);
                        }
                        if (! $hideMatchReasons && $matchReasons === [] && !empty($tagLabels)) {
                            $matchReasons[] = 'Tóny: '.implode(', ', array_slice($tagLabels, 0, 3));
                        }
                        if (! $hideMatchReasons && $matchReasons === [] && $genderLabel) {
                            $matchReasons[] = 'Pohlaví: '.$genderLabel;
                        } elseif (! $hideMatchReasons && $matchReasons === [] && !empty($metadata['highlight_gender'])) {
                            $matchReasons[] = 'Pohlaví';
                        }
                        if (! $hideMatchReasons && $matchReasons === [] && $defaultInspiredBrand) {
                            $matchReasons[] = 'Značka originálu: '.$defaultInspiredBrand;
                        }

                        $priceCurrentInt = $extractMoneyCents($price['action_price'] ?? $price['current'] ?? null);
                        $priceOriginalInt = $extractMoneyCents($price['base_price'] ?? $price['original'] ?? null);
                        $priceDiscountPercent = $extractInt($price['discount'] ?? null);
                        if ($priceDiscountPercent === null && $priceCurrentInt !== null && $priceOriginalInt !== null && $priceOriginalInt > 0) {
                            $priceDiscountPercent = (int) round(max(0, 100 - ($priceCurrentInt / $priceOriginalInt) * 100));
                        }
                        $priceCurrentDisplay = ($formatPrice)($priceCurrentInt, $locale);
                        $priceOriginalDisplay = ($formatPrice)($priceOriginalInt, $locale);
                        $discountDisplay = $priceDiscountPercent !== null ? sprintf('%d %%', $priceDiscountPercent) : null;
                        $showDiscount = $priceCurrentInt !== null && $priceOriginalInt !== null && $priceCurrentInt < $priceOriginalInt;

                        $sizeValue = Arr::get($metadata, 'size');
                        if ($sizeValue === null && isset($price['volume'])) {
                            if (preg_match('/(\d+(?:[\.,]\d+)?)/', (string) $price['volume'], $match)) {
                                $sizeValue = (float) str_replace(',', '.', $match[1]);
                            }
                        }
                        $sizeUnit = Arr::get($metadata, 'product_size_unit') ?? Arr::get($metadata, 'size_unit');
                        if (!$sizeUnit && isset($price['volume']) && preg_match('/\d+\s*([^\d]+)/', (string) $price['volume'], $match)) {
                            $sizeUnit = trim($match[1]);
                        }
                        $productVolumeLabel = null;
                        if ($sizeValue !== null) {
                            $productVolumeLabel = trim(sprintf('%s %s', (int) $sizeValue, $sizeUnit ?? ''));
                        } elseif (!empty($price['volume'])) {
                            $productVolumeLabel = (string) $price['volume'];
                        }

                        $genderIconPath = match ($defaultGender) {
                            'female' => '/user/documents/svg/female.svg',
                            'male' => '/user/documents/svg/male.svg',
                            'unisex' => '/user/documents/svg/unisex_icon.svg',
                            default => '',
                        };

                        $backgroundSuffix = match ($defaultGender) {
                            'female' => 'woman',
                            'male' => 'man',
                            'unisex' => 'uni',
                            default => 'uni',
                        };

                        $activeVariantId = $defaultVariantId;
                        $preselectedVariant = null;
                        $preselectedVariantHash = null;

                        // Remove debug output before production deployment.
                        $formattedVariantOptions = [];
                        foreach ($variantOptions as $optionIndex => $option) {
                            if (!is_array($option)) {
                                continue;
                            }

                            $optionVariantId = $option['variant_id'] ?? $option['id'] ?? null;
                            $optionPriceInt = $extractMoneyCents($option['variant_action_price'] ?? $option['action_price'] ?? $option['variant_price'] ?? $option['price'] ?? null);
                            $optionOriginalInt = $extractMoneyCents($option['base_price'] ?? $option['variant_original_price'] ?? $option['original_price'] ?? null);
                            $optionDiscountPercent = $optionPriceInt !== null && $optionOriginalInt !== null && $optionOriginalInt > 0
                                ? (int) round(max(0, 100 - ($optionPriceInt / $optionOriginalInt) * 100))
                                : null;
                            $optionDiscountValue = $optionPriceInt !== null && $optionOriginalInt !== null
                                ? max($optionOriginalInt - $optionPriceInt, 0)
                                : null;
                            $optionVolume = $option['volume'] ?? null;
                            $optionVolumeLabel = $option['volume_display'] ?? ($normalizeVolume)($optionVolume, null, $option['label'] ?? $optionVolume ?? null);
                            $optionVolumeAttribute = $option['volume_attribute'] ?? $option['volume_value'] ?? $optionVolumeLabel;
                            $optionUrl = $option['detail_url'] ?? $option['variant_url'] ?? $option['url'] ?? null;
                            $optionPriceDisplay = $option['variant_action_price']
                                ?? $option['action_price']
                                ?? $option['variant_price_display']
                                ?? $option['variant_price']
                                ?? $option['price']
                                ?? ($optionPriceInt !== null ? ($formatPrice)($optionPriceInt, $locale) : null);
                            if ($optionPriceDisplay !== null && is_numeric($optionPriceDisplay)) {
                                $optionPriceDisplay = ($formatPrice)((int) round((float) $optionPriceDisplay * 100), $locale);
                            }
                            $optionOriginalDisplay = $option['variant_original_price_display']
                                ?? $option['base_price']
                                ?? $option['variant_original_price']
                                ?? $option['original_price']
                                ?? ($optionOriginalInt !== null ? ($formatPrice)($optionOriginalInt, $locale) : null);
                            if ($optionOriginalDisplay !== null && is_numeric($optionOriginalDisplay)) {
                                $optionOriginalDisplay = ($formatPrice)((int) round((float) $optionOriginalDisplay * 100), $locale);
                            }

                            $optionBrand = $normalizeOptionalString($option['inspired_by_brand'] ?? null);
                            if (! $optionBrand) {
                                $optionBrand = $resolveBrandCandidate($option);
                            }
                            $optionTitle = $normalizeOptionalString($option['inspired_by_title'] ?? null);
                            if (! $optionTitle) {
                                $optionTitle = $resolveInspiredTitle($option, $optionBrand ?? $defaultInspiredBrand);
                            }

                            $formattedVariantOptions[] = [
                                'variant_id' => $optionVariantId,
                                'variant_code' => $option['variant_code'] ?? $option['code'] ?? null,
                                'variant_price' => $optionPriceInt,
                                'variant_original_price' => $optionOriginalInt,
                                'variant_discount_value' => $optionDiscountValue,
                                'variant_discount_percentage' => $optionDiscountPercent,
                                'variant_title' => $option['label'] ?? '',
                                'variant_stock_level' => $option['stock_level'] ?? 1,
                                'variant_url' => $optionUrl ?? $defaultDetailUrl,
                                'variant_detail_url' => $option['detail_url'] ?? $optionUrl ?? $defaultDetailUrl,
                                'variant_size' => $optionVolumeAttribute ?? '',
                                'display_size' => $optionVolumeLabel ?? '',
                                'variant_image' => $option['image_url'] ?? ($option['variant_image'] ?? ''),
                                'variant_mini_image' => $option['mini_image_url'] ?? ($option['variant_mini_image'] ?? ''),
                                'inspired_by_brand' => $optionBrand,
                                'inspired_by_title' => $optionTitle,
                                'variant_price_display' => $optionPriceDisplay,
                                'price_value' => $optionPriceInt,
                                'original_price_value' => $optionOriginalInt,
                                'variant_original_price_display' => $optionOriginalDisplay,
                            ];
                        }
                        // Ensure variants are sorted from the cheapest to the most expensive and find the most expensive available one.
                        if (! empty($formattedVariantOptions)) {
                            usort($formattedVariantOptions, static function (array $first, array $second): int {
                                $priceA = $first['variant_price'] ?? PHP_INT_MAX;
                                $priceB = $second['variant_price'] ?? PHP_INT_MAX;

                                return $priceA <=> $priceB;
                            });

                            $preselectedVariant = null;
                            foreach ($formattedVariantOptions as $candidateOption) {
                                $stockLevel = (int) ($candidateOption['variant_stock_level'] ?? 0);
                                if ($stockLevel <= 0) {
                                    continue;
                                }
                                if ($preselectedVariant === null) {
                                    $preselectedVariant = $candidateOption;
                                    continue;
                                }

                                $currentPrice = $preselectedVariant['variant_price'] ?? null;
                                $candidatePrice = $candidateOption['variant_price'] ?? null;

                                if ($candidatePrice !== null && ($currentPrice === null || $candidatePrice > $currentPrice)) {
                                    $preselectedVariant = $candidateOption;
                                }
                            }

                            if (! $preselectedVariant) {
                                $preselectedVariant = end($formattedVariantOptions) ?: null;
                                reset($formattedVariantOptions);
                            }

                            if ($preselectedVariant) {
                                $selectedVariantId = $preselectedVariant['variant_id'] ?? null;
                                $selectedVariantCode = $preselectedVariant['variant_code'] ?? null;

                                if ($selectedVariantId) {
                                    $defaultVariantId = $selectedVariantId;
                                }
                                if ($selectedVariantCode) {
                                    $defaultVariantCode = $selectedVariantCode;
                                }

                                if (!empty($preselectedVariant['variant_image'])) {
                                    $defaultImage = $preselectedVariant['variant_image'];
                                }
                                if (!empty($preselectedVariant['variant_mini_image'])) {
                                    $defaultMiniImage = $preselectedVariant['variant_mini_image'];
                                }

                                $defaultDetailUrl = $preselectedVariant['variant_detail_url']
                                    ?? $preselectedVariant['variant_url']
                                    ?? $defaultDetailUrl;

                                $productVolumeLabel = $preselectedVariant['display_size']
                                    ?? ($preselectedVariant['variant_size'] ?? $productVolumeLabel);

                                if (!empty($preselectedVariant['inspired_by_brand'])) {
                                    $defaultInspiredBrand = $preselectedVariant['inspired_by_brand'];
                                }
                                if (!empty($preselectedVariant['inspired_by_title'])) {
                                    $defaultInspiredTitle = $preselectedVariant['inspired_by_title'];
                                }

                                if (array_key_exists('variant_action_price', $preselectedVariant) && $preselectedVariant['variant_action_price'] !== null) {
                                    $priceCurrentInt = $preselectedVariant['variant_action_price'];
                                } elseif (array_key_exists('variant_action_price', $preselectedVariant) && $preselectedVariant['variant_action_price'] === null && array_key_exists('action_price', $preselectedVariant) && $preselectedVariant['action_price'] !== null) {
                                    $priceCurrentInt = $preselectedVariant['action_price'];
                                } elseif ($preselectedVariant['variant_price'] !== null) {
                                    $priceCurrentInt = $preselectedVariant['variant_price'];
                                }
                                if (array_key_exists('base_price', $preselectedVariant) && $preselectedVariant['base_price'] !== null) {
                                    $priceOriginalInt = $preselectedVariant['base_price'];
                                } elseif ($preselectedVariant['variant_original_price'] !== null) {
                                    $priceOriginalInt = $preselectedVariant['variant_original_price'];
                                }

                                $priceCurrentDisplay = $preselectedVariant['variant_price_display']
                                    ?? $preselectedVariant['variant_action_price']
                                    ?? $preselectedVariant['action_price']
                                    ?? ($priceCurrentInt !== null ? ($formatPrice)($priceCurrentInt, $locale) : null);
                                $priceOriginalDisplay = $preselectedVariant['variant_original_price_display']
                                    ?? $preselectedVariant['base_price']
                                    ?? ($priceOriginalInt !== null ? ($formatPrice)($priceOriginalInt, $locale) : null);

                                if (isset($preselectedVariant['variant_discount_percentage']) && $preselectedVariant['variant_discount_percentage'] !== null) {
                                    $priceDiscountPercent = (int) $preselectedVariant['variant_discount_percentage'];
                                    $discountDisplay = sprintf('%d %%', $priceDiscountPercent);
                                } elseif (isset($preselectedVariant['variant_discount_value']) && $preselectedVariant['variant_discount_value'] !== null) {
                                    $discountDisplay = ($formatPrice)((int) $preselectedVariant['variant_discount_value'], $locale);
                                    if ($priceCurrentInt !== null && $priceOriginalInt !== null && $priceOriginalInt > 0 && $priceCurrentInt < $priceOriginalInt) {
                                        $priceDiscountPercent = (int) round(max(0, 100 - ($priceCurrentInt / $priceOriginalInt) * 100));
                                    } else {
                                        $priceDiscountPercent = null;
                                    }
                                } else {
                                    if ($priceCurrentInt !== null && $priceOriginalInt !== null && $priceOriginalInt > 0 && $priceCurrentInt < $priceOriginalInt) {
                                        $priceDiscountPercent = (int) round(max(0, 100 - ($priceCurrentInt / $priceOriginalInt) * 100));
                                        $discountDisplay = sprintf('%d %%', $priceDiscountPercent);
                                    } else {
                                        $discountDisplay = null;
                                        $priceDiscountPercent = null;
                                    }
                                }

                                $showDiscount = $priceCurrentInt !== null
                                    && $priceOriginalInt !== null
                                    && $priceCurrentInt < $priceOriginalInt;
                            }
                        }
                        $preselectedVariantHash = null;
                        if ($preselectedVariant) {
                            $preselectedVariantHash = md5(json_encode([
                                'id' => $preselectedVariant['variant_id'] ?? null,
                                'code' => $preselectedVariant['variant_code'] ?? null,
                                'title' => $preselectedVariant['variant_title'] ?? null,
                                'size' => $preselectedVariant['variant_size'] ?? null,
                                'price' => $preselectedVariant['variant_price'] ?? null,
                            ]));
                        }
                        // End debug section.

                        if (! $defaultInspiredBrand) {
                            foreach ($formattedVariantOptions as $formattedOption) {
                                if (!empty($formattedOption['inspired_by_brand'])) {
                                    $defaultInspiredBrand = $formattedOption['inspired_by_brand'];
                                    break;
                                }
                            }
                        }

                        if (! $defaultInspiredTitle) {
                            foreach ($formattedVariantOptions as $formattedOption) {
                                if (!empty($formattedOption['inspired_by_title'])) {
                                    $defaultInspiredTitle = $formattedOption['inspired_by_title'];
                                    break;
                                }
                            }
                        }
                    @endphp
                    <div
                        class="kv-widget-slide"
                        style="flex: 0 0 auto; display: flex; justify-content: center;"
                        data-kv-widget-item="1"
                        data-widget-item-id="{{ e($item['product_widget_item_id'] ?? '') }}"
                        data-widget-id="{{ e($item['product_widget_id'] ?? '') }}"
                        data-product-id="{{ e($item['product_id'] ?? '') }}"
                        data-variant-id="{{ e($item['product_variant_id'] ?? '') }}"
                    >
                        <div
                            class="product brx-product"
                            product-master-id="{{ e($metadata['product_master_id'] ?? $item['item_id'] ?? '') }}"
                            product-master-title="{{ e($metadata['product_master_title'] ?? $defaultTitle) }}"
                            variant-id="{{ e($defaultVariantId ?? $metadata['variant_id'] ?? '') }}"
                            variant-title="{{ e($buyButton['variant_title'] ?? $defaultTitle) }}"
                            style="border: 1px solid rgb(201, 201, 201); border-radius: 30px; padding: 20px 15px; margin-bottom: 40px; display: block; width: 300px; min-width: 300px;"
                            data-widget-item="1"
                            data-default-image="{{ e($defaultImage ?? '') }}"
                            data-default-mini-image="{{ e($defaultMiniImage ?? '') }}"
                            data-default-price="{{ e($priceCurrentDisplay ?? '') }}"
                            data-default-original-price="{{ e($priceOriginalDisplay ?? '') }}"
                            data-default-volume="{{ e($productVolumeLabel ?? '') }}"
                            data-default-discount="{{ e($discountDisplay ?? '') }}"
                            data-default-discount-percent="{{ e($priceDiscountPercent ?? '') }}"
                            data-default-detail-url="{{ e($defaultDetailUrl) }}"
                            data-default-title="{{ e($defaultTitle) }}"
                            data-default-original-name="{{ e($defaultInspiredTitle ?? '') }}"
                            data-title-color="{{ e($defaultTitleColor ?? '') }}"
                            data-appendix-background="https://www.krasnevune.cz/user/documents/upload/{{ $backgroundSuffix }}_bg_p.svg"
                            data-default-gender="{{ e($defaultGender ?? '') }}"
                            data-default-gender-icon="{{ e($defaultGenderIcon ?? $genderIconPath) }}"
                            data-default-inspired-brand="{{ e($defaultInspiredBrand ?? '') }}"
                            data-default-inspired-title="{{ e($defaultInspiredTitle ?? '') }}"
                            data-default-variant-code="{{ e($defaultVariantCode ?? '') }}"
                            data-active-variant-id="{{ e($defaultVariantId ?? '') }}"
                            data-default-subtitle="{{ e($defaultSubtitle ?? '') }}"
                            data-default-appendix-style="{{ e($appendixInlineStyle) }}"
                            data-highlight-gender="{{ !empty($metadata['highlight_gender']) ? '1' : '0' }}"
                            data-highlight-tags="{{ e(implode('|', $metadata['highlight_tags'] ?? [])) }}"
                        >
                            <div class="p" data-micro="product" data-testid="productItem" style="justify-content: space-between; margin: 0 auto; display: flex; flex-direction: column; height: 100%; position: relative;">
                                <a href="{{ e($defaultDetailUrl) }}" class="image" style="display: block; position: relative; text-align: center;">
                                    @if (!empty($defaultGenderIcon ?? $genderIconPath))
                                        <img src="{{ e($defaultGenderIcon ?? $genderIconPath) }}" class="gender_img_icon" style="position: absolute;" width="40" loading="lazy" alt="">
                                    @endif
                                    @if ($defaultImage)
                                        <img src="{{ e($defaultImage) }}" fetchpriority="low" loading="lazy" data-role="product-image" style="height: 185px; margin-bottom: 18px;" alt="{{ e(strip_tags($defaultTitle)) }}">
                                    @endif
                                    <div style="left: 0; position: absolute; top: 0;">
                                        <span class="brx-flag-action" style="display: {{ $showDiscount ? 'block' : 'none' }}; border-radius: 50px; text-transform: uppercase; font-weight: 400; font-size: 10px; background-color: #cd3e96; padding: 4px 10px; color: #fff;">Akce</span>
                                    </div>
                                    @if ($defaultMiniImage && ! $isBanned)
                                        <div class="mini-original-parfume" data-role="mini-wrapper">
                                            <img src="{{ e($defaultMiniImage) }}" loading="lazy" data-role="mini-image" alt="">
                                        </div>
                                    @endif
                                </a>
                                @if (!empty($tagLabels))
                                    <ul class="tags">
                                        @foreach ($tagLabels as $labelIndex => $label)
                                            @if ($labelIndex < 3)
                                                <li class="tag">{{ e($label) }}</li>
                                            @endif
                                        @endforeach
                                    </ul>
                                @endif
                                <div class="p-in">
                                    <div class="p-in-in" style="margin-top: 15px;">
                                        <a href="{{ e($defaultDetailUrl) }}" class="name" data-micro="url" style="border-bottom: 0; font-weight: 400; display: block; text-align: center;">
                                            <span data-micro="name" data-testid="productCardName" style="color: {{ $defaultTitleColor ?? ($defaultGender === 'female' ? 'rgb(214, 52, 90)' : ($defaultGender === 'male' ? 'rgb(52, 97, 214)' : 'black')) }}">
                                                <span data-role="product-name-text">{{ Str::limit(strip_tags($defaultTitle), 30, '...') }}</span>
                                                <span class="product-appendix category-appendix" style="{{ $appendixInlineStyle }}">
                                                    {{ e($defaultSubtitle) }}
                                                    @php
                                                        $subtitleNormalized = Str::lower($stripDiacritics($defaultSubtitle ?? ''));
                                                        $subtitleAllowsInspiration = $subtitleNormalized !== ''
                                                            && (str_contains($subtitleNormalized, 'parfemovan') || str_contains($subtitleNormalized, 'parfé') || str_contains($subtitleNormalized, 'toaletn'));
                                                        $shouldShowInspiration = ! $isBanned
                                                            && $defaultInspiredBrand
                                                            && $subtitleAllowsInspiration
                                                            && ! \Modules\Inventory\Http\Controllers\InventoryRecommendationWidgetController::isLocalBrandStatic(
                                                                $defaultInspiredBrand,
                                                                $metadata['znacka'] ?? $defaultInspiredBrand
                                                            );
                                                    @endphp
                                                    @if ($shouldShowInspiration)
                                                        <span class="changable">, zaměňována s:<br>
                                                            <strong style="background-image: url('https://www.krasnevune.cz/user/documents/upload/{{ $backgroundSuffix }}_bg_p.svg');">
                                                                @if ($defaultInspiredBrand)
                                                                    <span class="inspired-brand">{{ e($defaultInspiredBrand) }}</span>
                                                                @endif
                                                                @if ($defaultInspiredTitle)
                                                                    @if ($defaultInspiredBrand)
                                                                        <br>
                                                                    @endif
                                                                    <span class="inspired-title">{{ e($defaultInspiredTitle) }}</span>
                                                                @endif
                                                            </strong>
                                                        </span>
                                                    @endif
                                                </span>
                                            </span>
                                        </a>
                                        @php
                                            $reasonList = [];
                                        @endphp
                                        <!-- do not display favorite icon -->
                                        <span class="favorite-icon" data-id="" style="cursor: pointer; margin-left: 10px; display: none;">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" height="24px" width="24px">
                                                <path stroke-width="2" stroke="#282828" fill="none" d="M2 9.1371C2 14 6.01943 16.5914 8.96173 18.9109C10 19.7294 11 20.5 12 20.5C13 20.5 14 19.7294 15.0383 18.9109C17.9806 16.5914 22 14 22 9.1371C22 4.27416 16.4998 0.825464 12 5.50063C7.50016 0.825464 2 4.27416 2 9.1371Z"></path>
                                            </svg>
                                        </span>
                                    </div>
                                    <div class="p-bottom single-button" style="height: 70px;">
                                        <div style="display: flex; flex-wrap: wrap; align-items: center; flex-direction: column;">
                                            <div class="prices">
                                                <div class="price price-final" data-testid="productCardPrice">
                                                    <span class="brx-price-standard" style="display: {{ $showDiscount ? 'inline-block' : 'none' }}; padding-top: 4px;">
                                                        <span style="font-weight: 500; color: #000; margin: 0; position: relative; top: 2px; margin-left: -40px !important; text-decoration: line-through;">
                                                            {{ $priceOriginalDisplay }}
                                                        </span>
                                                    </span>
                                                    @if ($productVolumeLabel)
                                                        <span class="productVolume" style="font-size: 11px; font-weight: 800 !important; left: 15px; margin-top: 10px;">
                                                            {{ e($productVolumeLabel) }}
                                                        </span>
                                                    @endif
                                                    <strong style="visibility: visible; {{ $showDiscount ? 'color: #f44336;' : '' }} font-weight: 800 !important; position: absolute; right: 15px; font-size: 20px;">{{ $priceCurrentDisplay }}</strong>
                                                    <span class="brx-price-save" style="display: {{ $showDiscount ? 'inline-block' : 'none' }}; font-size: 14px; position: relative; top: 2px; font-weight: 600 !important; {{ $showDiscount ? 'color: #f44336;' : '' }}">{{ $discountDisplay }}</span>
                                                </div>
                                            </div>
                                            <div class="p-tools" style="display: flex; flex-direction: row-reverse; width: 100%; justify-content: space-between; margin-top: 32px; position: absolute;">
                                                <button
                                                    style="margin-left:5px"
                                                    class="btn btn-cart add-to-cart-button add-to-cart-category"
                                                    data-action="buy"
                                                    variant-id="{{ e($defaultVariantId ?? '') }}"
                                                    variant-code="{{ e($defaultVariantCode ?? '') }}"
                                                    data-variant-id="{{ e($defaultVariantId ?? '') }}"
                                                    data-variant-code="{{ e($defaultVariantCode ?? '') }}"
                                                >
                                                    <span>Do košíku</span>
                                                </button>
                                                <a href="{{ e($defaultDetailUrl) }}" class="btn btn-primary" style="font-weight: 500; border-color: #259B63 !important; text-transform: capitalize;">Detail</a>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                @php
                                    $hasMultipleVariants = is_array($formattedVariantOptions) && count($formattedVariantOptions) > 1;
                                @endphp
                                <div class="widget-parameter-wrapper" data-parameter-name="Velikost" data-parameter-id="5" data-parameter-single="true" style="display: {{ $hasMultipleVariants ? 'flex' : 'none' }}; justify-content: center; position: absolute; bottom: 80px; width: 100%;">
                                    @if (!empty($formattedVariantOptions))
                                        <ul class="widget-parameter-list" style="list-style: none; display: flex; flex-wrap: nowrap; justify-content: center; gap: 0; padding: 0; margin: 0; overflow-x: auto;">
                                            @foreach ($formattedVariantOptions as $optionIndex => $option)
                                                @php
                                                    $optionBrand = null;
                                                    $optionTitle = null;
                                                @endphp
                                                @php
                                                    $variantPriceDisplay = $option['variant_price_display']
                                                        ?? ($option['variant_action_price'] ?? $option['action_price'] ?? $option['variant_price'] ?? $option['price'] ?? null)
                                                        ?? null;
                                                    if ($variantPriceDisplay === null && isset($option['price_value'])) {
                                                        $variantPriceDisplay = $formatPrice((int) $option['price_value'], $locale);
                                                    } elseif ($variantPriceDisplay !== null && is_numeric($variantPriceDisplay)) {
                                                        $variantPriceDisplay = $formatPrice((int) $variantPriceDisplay, $locale);
                                                    }

                                                    $variantOriginalPriceDisplay = $option['variant_original_price_display'] ?? null;
                                                    if ($variantOriginalPriceDisplay === null) {
                                                        if (isset($option['base_price'])) {
                                                            $variantOriginalPriceDisplay = is_numeric($option['base_price'])
                                                                ? $formatPrice((int) $option['base_price'], $locale)
                                                                : (string) $option['base_price'];
                                                        } elseif (isset($option['variant_original_price'])) {
                                                            $variantOriginalPriceDisplay = is_numeric($option['variant_original_price'])
                                                                ? $formatPrice((int) $option['variant_original_price'], $locale)
                                                                : (string) $option['variant_original_price'];
                                                        }
                                                    }

                                                    $variantImage = $option['variant_image'] ?? ($option['variant_mini_image'] ?? '');
                                                    $variantDetailUrl = $option['variant_detail_url'] ?? ($option['variant_url'] ?? '#');
                                                    $variantVolumeDisplay = $option['display_size'] ?? ($option['variant_size'] ?? '');

                                                    $variantDiscountDisplay = null;
                                                    if (isset($option['variant_discount_percentage']) && $option['variant_discount_percentage'] !== null) {
                                                        $variantDiscountDisplay = sprintf('%d %%', (int) $option['variant_discount_percentage']);
                                                    } elseif (isset($option['variant_discount_value']) && $option['variant_discount_value'] !== null) {
                                                        $variantDiscountDisplay = $formatPrice((int) $option['variant_discount_value'], $locale) ?? (string) $option['variant_discount_value'];
                                                    }

                                                    $optionBrand = $normalizeOptionalString($option['inspired_by_brand'] ?? null);
                                                    if (! $optionBrand) {
                                                        $optionBrand = $resolveBrandCandidate($option);
                                                    }
                                                    $optionTitle = $normalizeOptionalString($option['inspired_by_title'] ?? null);
                                                    if (! $optionTitle) {
                                                        $optionTitle = $resolveInspiredTitle($option, $optionBrand ?? $defaultInspiredBrand);
                                                    }

                                                    $optionVariantId = $option['variant_id'] ?? null;
                                                    $optionVariantCode = $option['variant_code'] ?? null;
                                                    $isActiveVariant = false;
                                                    $optionHash = md5(json_encode([
                                                        'id' => $optionVariantId,
                                                        'code' => $optionVariantCode,
                                                        'title' => $option['variant_title'] ?? null,
                                                        'size' => $option['variant_size'] ?? null,
                                                        'price' => $option['variant_price'] ?? null,
                                                    ]));
                                                    if ($optionVariantId && $defaultVariantId && $optionVariantId === $defaultVariantId) {
                                                        $isActiveVariant = true;
                                                    } elseif ($optionVariantCode && $defaultVariantCode && $optionVariantCode === $defaultVariantCode) {
                                                        $isActiveVariant = true;
                                                    } elseif ($preselectedVariantHash && $preselectedVariantHash === $optionHash) {
                                                        $isActiveVariant = true;
                                                    } elseif (! $preselectedVariantHash && $loop->first) {
                                                        $isActiveVariant = true;
                                                    }
                                                @endphp
                                                <li
                                                    class="widget-parameter-value {{ $isActiveVariant ? 'active-variant' : '' }}"
                                                    style="list-style: none; display: inline-flex; border: none; padding: 0;"
                                                    variant-id="{{ e($option['variant_id'] ?? '') }}"
                                                    variant-image="{{ e($variantImage) }}"
                                                    variant-code="{{ e($option['variant_code'] ?? '') }}"
                                                    variant-price="{{ $variantPriceDisplay !== null ? e($variantPriceDisplay) : '' }}"
                                                    variant-original_price="{{ $variantOriginalPriceDisplay !== null ? e($variantOriginalPriceDisplay) : '' }}"
                                                    variant-title="{{ e($option['variant_title']) }}"
                                                    variant-stock_level="{{ e($option['variant_stock_level'] ?? '') }}"
                                                    variant-url="{{ e($variantDetailUrl) }}"
                                                    variant-size="{{ e($variantVolumeDisplay) }}"
                                                    variant-discount_value="{{ $variantDiscountDisplay !== null ? e($variantDiscountDisplay) : '' }}"
                                                    variant-discount_percentage="{{ e($option['variant_discount_percentage'] ?? '') }}"
                                                    variant-original_price_display="{{ $variantOriginalPriceDisplay !== null ? e($variantOriginalPriceDisplay) : '' }}"
                                                    variant-price_display="{{ $variantPriceDisplay !== null ? e($variantPriceDisplay) : '' }}"
                                                    variant-inspired_brand="{{ e($optionBrand ?? '') }}"
                                                    variant-inspired_title="{{ e($optionTitle ?? '') }}"
                                                    data-variant-id="{{ e($option['variant_id'] ?? '') }}"
                                                    data-variant-image="{{ e($variantImage) }}"
                                                    data-variant-code="{{ e($option['variant_code'] ?? '') }}"
                                                    data-variant-price="{{ $variantPriceDisplay !== null ? e($variantPriceDisplay) : '' }}"
                                                    data-variant-original-price="{{ $variantOriginalPriceDisplay !== null ? e($variantOriginalPriceDisplay) : '' }}"
                                                    data-variant-url="{{ e($variantDetailUrl) }}"
                                                    data-variant-volume="{{ e($variantVolumeDisplay) }}"
                                                    data-variant-discount="{{ $variantDiscountDisplay !== null ? e($variantDiscountDisplay) : '' }}"
                                                    data-variant-discount-percent="{{ e($option['variant_discount_percentage'] ?? '') }}"
                                                    data-variant-detail-url="{{ e($variantDetailUrl) }}"
                                                    data-variant-mini-image="{{ e($option['variant_mini_image'] ?? '') }}"
                                                    data-variant-inspired-brand="{{ e($optionBrand ?? '') }}"
                                                    data-variant-inspired-title="{{ e($optionTitle ?? '') }}"
                                                >
                                                    <a
                                                        style="cursor: pointer; display: inline-block; min-width: 48px; padding: 5px; font-size: 12px; font-weight: 500; text-decoration: none; text-align: center; border: 1px solid #259B63; border-left-width: {{ $loop->first ? '1px' : '0' }}; border-radius: {{ $loop->first && $loop->last ? '24px' : ($loop->first ? '24px 0 0 24px' : ($loop->last ? '0 24px 24px 0' : '0')) }}; color: {{ $isActiveVariant ? '#ffffff' : '#000000' }}; background: {{ $isActiveVariant ? '#259B63' : '#ffffff' }};"
                                                        title="Velikost: {{ e($variantVolumeDisplay) }}"
                                                    >
                                                        {{ e($variantVolumeDisplay !== '' ? $variantVolumeDisplay : ($option['variant_title'] ?? 'Varianta')) }}
                                                    </a>
                                                </li>
                                            @endforeach
                                        </ul>
                                    @else
                                        <ul class="widget-parameter-list" style="list-style: none; display: flex; flex-wrap: nowrap; justify-content: center; gap: 0; padding: 0; margin: 0; overflow-x: auto;"></ul>
                                    @endif
                                </div>
                            </div>
                        </div>
                    </div>
                @endforeach
                </div>
            </div>
            <button
                class="kv-widget-nav kv-widget-next"
                type="button"
                aria-label="Další produkt"
                style="width: 44px; height: 44px; border-radius: 50%; border: 1px solid rgba(208, 213, 232, 0.8); background: #ffffff; color: #1fb56b; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease; position: absolute; top: 50%; transform: translateY(-50%); right: 8px; z-index: 2;"
            >
                <span aria-hidden="true" style="font-size: 24px; line-height: 1; font-weight: 600;">›</span>
            </button>
            <div class="kv-widget-slider-dots" aria-hidden="true" style="position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); display: none; align-items: center; gap: 10px;"></div>
        </div>
    </div>
</div>
