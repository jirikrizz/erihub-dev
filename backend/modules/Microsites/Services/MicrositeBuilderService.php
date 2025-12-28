<?php

namespace Modules\Microsites\Services;

use DOMDocument;
use DOMXPath;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Modules\Microsites\Models\Microsite;
use Modules\Microsites\Models\MicrositePublication;

class MicrositeBuilderService
{
    public function __construct(private readonly MicrositeProductResolver $productResolver)
    {
    }

    /**
     * Generate static bundle for the microsite and persist publication metadata.
     *
     * @return array{path: string, url: string, snapshot: array<string, mixed>}
     */
    public function buildAndPublish(Microsite $microsite, MicrositePublication $publication): array
    {
        $microsite->load('products');
        $this->refreshProductSnapshots($microsite);

        $snapshot = $this->generateSnapshot($microsite);
        $html = $this->renderMicrosite($microsite);

        $relativePath = $this->writeStaticBundle($microsite, $html);
        $publicUrl = $this->publicUrl($microsite);

        $settings = $microsite->settings ?? [];
        $settings['publication'] = array_merge($settings['publication'] ?? [], [
            'generated_at' => now()->toIso8601String(),
            'path' => $relativePath,
            'url' => $publicUrl,
            'snapshot' => $snapshot,
            'publication_id' => $publication->id,
        ]);

        $microsite->forceFill([
            'settings' => $settings,
        ])->save();

        return [
            'path' => $relativePath,
            'url' => $publicUrl,
            'snapshot' => $snapshot,
        ];
    }

    /**
     * Build export artifact (JSON bundle) for external hosting.
     *
     * @return array{path: string, url: string|null}
     */
    public function buildExportBundle(Microsite $microsite, MicrositePublication $publication): array
    {
        $microsite->load('products');
        $this->refreshProductSnapshots($microsite);

        $snapshot = $this->generateSnapshot($microsite);

        $payload = json_encode([
            'microsite' => Arr::except($microsite->toArray(), ['created_at', 'updated_at']),
            'products' => $microsite->products()->orderBy('position')->get()->toArray(),
            'snapshot' => $snapshot,
            'generated_at' => now()->toIso8601String(),
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

        $path = sprintf('microsites/exports/%s/export_%s.json', $microsite->id, now()->timestamp);
        Storage::disk('local')->put($path, $payload ?: '{}');

        return [
            'path' => $path,
            'url' => null,
        ];
    }

    private function refreshProductSnapshots(Microsite $microsite): void
    {
        $shopId = Arr::get($microsite->settings, 'source_shop_id');

        $microsite->products->each(function ($product) use ($shopId): void {
            if (! $product->product_code) {
                return;
            }

            $snapshot = $this->productResolver->snapshotByVariantCode($product->product_code, $shopId);

            if (! $snapshot) {
                return;
            }

            if ($product->snapshot === $snapshot && $product->product_variant_id === ($snapshot['variant_id'] ?? null)) {
                return;
            }

            $product->forceFill([
                'product_variant_id' => $product->product_variant_id ?? $snapshot['variant_id'] ?? null,
                'snapshot' => $snapshot,
            ])->save();
        });
    }

    /**
     * @return array<string, mixed>
     */
    private function generateSnapshot(Microsite $microsite): array
    {
        return [
            'generated_at' => now()->toIso8601String(),
            'microsite' => Arr::only($microsite->toArray(), [
                'id',
                'name',
                'slug',
                'status',
                'theme',
                'hero',
                'seo',
                'content_schema',
                'settings',
                'published_at',
                'locale',
                'currency',
                'brand',
                'primary_domain',
                'domains',
            ]),
            'products' => $microsite->products
                ->sortBy('position')
                ->values()
                ->map(function ($product) {
                    return [
                        'id' => $product->id,
                        'product_variant_id' => $product->product_variant_id,
                        'product_code' => $product->product_code,
                        'position' => $product->position,
                        'custom_price' => $product->custom_price,
                        'custom_currency' => $product->custom_currency,
                        'custom_label' => $product->custom_label,
                        'custom_description' => $product->custom_description,
                        'cta_text' => $product->cta_text,
                        'cta_url' => $product->cta_url,
                        'visible' => $product->visible,
                        'snapshot' => $product->snapshot,
                    ];
                })
                ->all(),
        ];
    }

    private function renderMicrosite(Microsite $microsite): string
    {
        if ($builder = $this->renderBuilderLayout($microsite)) {
            return $builder;
        }

        $microsite->load('products');
        $view = view('microsites::public', [
            'microsite' => $microsite,
        ]);

        return $view->render();
    }

    /**
     * Persist HTML bundle onto public disk for direct serving.
     */
    private function writeStaticBundle(Microsite $microsite, string $html): string
    {
        $relativePath = sprintf('microshop/%s/index.html', Str::slug($microsite->slug));

        $disk = Storage::disk('public');

        $previousPath = Arr::get($microsite->settings, 'publication.path');
        if ($previousPath && $previousPath !== $relativePath) {
            $disk->delete($previousPath);
        }

        $disk->put($relativePath, $html);

        return $relativePath;
    }

    private function publicUrl(Microsite $microsite): string
    {
        return url(sprintf('/microshop/%s', Str::slug($microsite->slug)));
    }

    private function renderBuilderLayout(Microsite $microsite): ?string
    {
        $builder = Arr::get($microsite->content_schema, 'builder');

        if (! is_array($builder) || empty($builder['html'])) {
            return null;
        }

        $html = (string) ($builder['html'] ?? '');
        $css = (string) ($builder['css'] ?? '');

        $transformedHtml = $this->transformBuilderHtml($microsite, $html);

        $title = Arr::get($microsite->seo, 'title', $microsite->name);
        $description = Arr::get($microsite->seo, 'description', '');

        return <<<HTML
<!DOCTYPE html>
<html lang="cs">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{$title}</title>
    <meta name="description" content="{$description}">
    <style>
{$this->defaultBuilderCss()}
{$css}
    </style>
</head>
<body>
{$transformedHtml}
</body>
</html>
HTML;
    }

    private function transformBuilderHtml(Microsite $microsite, string $html): string
    {
        $dom = new DOMDocument('1.0', 'UTF-8');
        libxml_use_internal_errors(true);
        $dom->loadHTML('<?xml encoding="UTF-8">'.$html, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
        libxml_clear_errors();

        $xpath = new DOMXPath($dom);
        $productNodes = $xpath->query('//*[@data-microshop-block="product-grid"]');

        if ($productNodes) {
            foreach ($productNodes as $node) {
                /** @var \DOMElement $node */
                foreach (iterator_to_array($node->childNodes) as $child) {
                    if ($child instanceof \DOMElement && $child->hasAttribute('data-sample')) {
                        $node->removeChild($child);
                    }
                }

                foreach ($microsite->products->where('visible', true) as $product) {
                    $fragment = $dom->createDocumentFragment();
                    $fragment->appendXML($this->renderProductCardHtml($microsite, $product));
                    $node->appendChild($fragment);
                }
            }
        }

        $body = $dom->getElementsByTagName('body')->item(0);

        if (! $body) {
            return $html;
        }

        $output = '';
        foreach ($body->childNodes as $child) {
            $output .= $dom->saveHTML($child);
        }

        return $output;
    }

    private function renderProductCardHtml(Microsite $microsite, $product): string
    {
        $snapshot = $product->snapshot ?? [];
        $images = Arr::get($snapshot, 'images', []);
        $image = $product->image_url
            ?? (is_array($images) && isset($images[0]['url']) ? $images[0]['url'] : null);
        $label = $product->name ?? $product->custom_label ?? Arr::get($snapshot, 'name') ?? $product->product_code ?? 'Produkt';
        $description = $product->custom_description ?? Arr::get($snapshot, 'description', '');
        $priceCents = $product->price_cents ?? null;
        if ($priceCents === null && $product->custom_price !== null) {
            $priceCents = (int) round((float) $product->custom_price * 100);
        }
        if ($priceCents === null && isset($snapshot['price'])) {
            $priceCents = (int) round((float) $snapshot['price'] * 100);
        }

        $currency = $product->price_currency ?? $product->custom_currency ?? Arr::get($snapshot, 'currency', 'CZK');
        $ctaText = $product->cta_text ?? 'Koupit';
        $ctaUrl = $product->cta_url ?? Arr::get($microsite->settings, 'checkout.stripe_link');

        $priceMarkup = $priceCents !== null
            ? sprintf('<span class="price">%s %s</span>', number_format($priceCents / 100, 0, ',', ' '), e($currency))
            : '';

        $imageMarkup = $image
            ? sprintf('<img src="%s" alt="%s" loading="lazy" />', e($image), e($label))
            : '<div class="microshop-product-image-placeholder"></div>';

        $ctaMarkup = $ctaUrl
            ? sprintf('<a class="cta" href="%s" target="_blank" rel="noopener">%s</a>', e($ctaUrl), e($ctaText))
            : '';

        $descriptionMarkup = $description ? sprintf('<p>%s</p>', nl2br(e($description))) : '';

        return sprintf(
            '<article class="microshop-product-card">%s<h3>%s</h3>%s<div class="microshop-product-footer">%s%s</div></article>',
            $imageMarkup,
            e($label),
            $descriptionMarkup,
            $priceMarkup,
            $ctaMarkup
        );
    }

    private function defaultBuilderCss(): string
    {
        return <<<'CSS'
:root {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #10131f;
  background: radial-gradient(circle at top, #eef2ff, #f8f9fd 45%);
}
body {
  margin: 0;
  background: transparent;
  color: #10131f;
}
section {
  width: 100%;
}
.microshop-hero {
  max-width: 1080px;
  margin: 4rem auto 3rem;
  padding: 4.5rem clamp(1.5rem, 4vw, 4rem);
  border-radius: 36px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 2rem;
  background: linear-gradient(140deg, rgba(91, 33, 255, 0.85), rgba(13, 148, 136, 0.65));
  color: #fff;
  position: relative;
  overflow: hidden;
}
.microshop-hero::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 20% 20%, rgba(255,255,255,0.28), transparent 55%);
  pointer-events: none;
}
.microshop-hero-inner {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.microshop-hero-badge {
  align-self: flex-start;
  padding: 0.5rem 1.25rem;
  border-radius: 999px;
  background: rgba(255,255,255,0.18);
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.08em;
  font-size: 0.75rem;
}
.microshop-hero h1 {
  font-size: clamp(2.6rem, 5vw, 4rem);
  margin: 0;
}
.microshop-hero p {
  margin: 0;
  max-width: 540px;
  line-height: 1.7;
  font-size: 1.1rem;
}
.microshop-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}
.microshop-hero-button {
  background: #fff;
  color: #10131f;
  padding: 0.85rem 1.75rem;
  border-radius: 999px;
  font-weight: 600;
  text-decoration: none;
}
.microshop-hero-link {
  color: #fff;
  font-weight: 500;
  text-decoration: none;
}
.microshop-hero-image {
  position: relative;
  z-index: 1;
  min-height: 260px;
  border-radius: 28px;
  background: linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.06));
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.25);
}

.microshop-product-grid {
  max-width: 1080px;
  margin: 0 auto;
  padding: 0 1.5rem 4rem;
  display: grid;
  gap: 2rem;
}
.microshop-product-card {
  background: #fff;
  border-radius: 28px;
  padding: 1.9rem;
  box-shadow: 0 30px 60px rgba(16, 19, 31, 0.12);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}
.microshop-product-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 40px 80px rgba(16, 19, 31, 0.16);
}
.microshop-product-image-placeholder,
.microshop-product-card img {
  border-radius: 20px;
  height: 220px;
  width: 100%;
  object-fit: cover;
  background: linear-gradient(135deg, rgba(91,33,255,0.12), rgba(248,249,252,0.92));
}
.microshop-product-card h3 {
  margin: 0;
  font-size: 1.25rem;
  color: #10131f;
}
.microshop-product-card p {
  margin: 0;
  color: rgba(16, 19, 31, 0.65);
  line-height: 1.6;
}
.microshop-product-footer {
  margin-top: auto;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
}
.microshop-product-card .price {
  font-weight: 700;
  font-size: 1.1rem;
  color: #5B21FF;
}
.microshop-product-card .cta {
  padding: 0.65rem 1.75rem;
  border-radius: 999px;
  border: none;
  background: #10131f;
  color: #fff;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.2s ease;
}
.microshop-product-card .cta:hover {
  background: #202538;
}

.microshop-benefits {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(16px);
  padding: 4rem 1.5rem;
  margin: 0 auto;
}
.microshop-benefits-inner {
  max-width: 1080px;
  margin: 0 auto;
  display: grid;
  gap: 2rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
.microshop-benefits article {
  background: rgba(16, 19, 31, 0.05);
  border-radius: 20px;
  padding: 1.75rem;
  backdrop-filter: blur(8px);
  border: 1px solid rgba(16, 19, 31, 0.08);
}
.microshop-benefits h4 {
  margin: 0 0 0.75rem;
  font-size: 1.1rem;
}
.microshop-benefits p {
  margin: 0;
  color: rgba(16, 19, 31, 0.65);
  line-height: 1.6;
}

.microshop-testimonials {
  padding: 4rem 1.5rem 5rem;
}
.microshop-testimonials-inner {
  max-width: 920px;
  margin: 0 auto;
  display: grid;
  gap: 2.5rem;
}
.microshop-testimonials figure {
  margin: 0;
  background: rgba(16, 19, 31, 0.9);
  color: #fff;
  padding: 2.5rem;
  border-radius: 28px;
  position: relative;
  overflow: hidden;
}
.microshop-testimonials figure::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 20% 20%, rgba(91,33,255,0.35), transparent 55%);
  opacity: 0.6;
  pointer-events: none;
}
.microshop-testimonials blockquote {
  margin: 0;
  font-size: 1.2rem;
  line-height: 1.8;
  position: relative;
  z-index: 2;
}
.microshop-testimonials figcaption {
  margin-top: 1.5rem;
  font-size: 0.95rem;
  opacity: 0.85;
  position: relative;
  z-index: 2;
}

.microshop-cta {
  padding: 5rem 1.5rem 6rem;
}
.microshop-cta-inner {
  max-width: 920px;
  margin: 0 auto;
  text-align: center;
  background: linear-gradient(130deg, rgba(13,148,136,0.92), rgba(91,33,255,0.75));
  color: #fff;
  padding: 4rem clamp(1.5rem, 4vw, 4rem);
  border-radius: 32px;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.microshop-cta h2 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3rem);
}
.microshop-cta p {
  margin: 0;
  color: rgba(255,255,255,0.88);
  font-size: 1.05rem;
  line-height: 1.7;
}
.microshop-cta-button {
  align-self: center;
  background: #fff;
  color: #10131f;
  padding: 0.95rem 2.5rem;
  border-radius: 999px;
  font-weight: 600;
  text-decoration: none;
  transition: transform 0.2s ease;
}
.microshop-cta-button:hover {
  transform: translateY(-3px);
}

@media (max-width: 768px) {
  .microshop-hero {
    margin: 3rem 1rem;
    padding: 3.5rem 2rem;
  }
  .microshop-product-card {
    padding: 1.5rem;
  }
  .microshop-benefits-inner {
    grid-template-columns: 1fr;
  }
  .microshop-testimonials-inner {
    grid-template-columns: 1fr;
  }
  .microshop-cta-inner {
    padding: 3.5rem 2.5rem;
  }
}
CSS;
    }
}
