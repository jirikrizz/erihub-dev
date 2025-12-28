<!DOCTYPE html>
<html lang="cs">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $microsite->seo['title'] ?? $microsite->name }}</title>
    <meta name="description" content="{{ $microsite->seo['description'] ?? '' }}">
    <style>
        body {
            margin: 0;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #f8f9fd;
            color: #10131f;
        }
        .hero {
            padding: 6rem 1.5rem 4rem;
            text-align: center;
            background: linear-gradient(145deg, rgba(110,148,255,0.12), rgba(56,210,196,0.08));
        }
        .hero-title {
            font-size: clamp(2.4rem, 5vw, 3.4rem);
            margin-bottom: 1rem;
        }
        .hero-subtitle {
            max-width: 720px;
            margin: 0 auto;
            font-size: 1.1rem;
            color: rgba(16,19,31,0.7);
        }
        .products {
            max-width: 1080px;
            margin: 0 auto;
            padding: 3rem 1.5rem 4rem;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 2rem;
        }
        .product-card {
            background: #fff;
            border-radius: 22px;
            padding: 1.6rem;
            box-shadow: 0 18px 42px rgba(24, 36, 78, 0.12);
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }
        .product-card h3 {
            margin: 0;
            font-size: 1.2rem;
        }
        .product-card p {
            margin: 0;
            color: rgba(16, 19, 31, 0.65);
            line-height: 1.5;
        }
        .product-footer {
            margin-top: auto;
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 1rem;
        }
        .price {
            font-weight: 600;
            font-size: 1.1rem;
        }
        .cta {
            padding: 0.65rem 1.25rem;
            border-radius: 999px;
            border: none;
            background: #4568f3;
            color: #fff;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
        }
    </style>
</head>
<body>
    <section class="hero">
        <h1 class="hero-title">{{ $microsite->hero['title'] ?? $microsite->name }}</h1>
        @if(!empty($microsite->hero['subtitle']))
            <p class="hero-subtitle">{{ $microsite->hero['subtitle'] }}</p>
        @endif
    </section>

    <section class="products">
        @foreach ($microsite->products->where('visible', true) as $product)
            <article class="product-card">
                <h3>{{ $product->custom_label ?? data_get($product->snapshot, 'name', 'Produkt') }}</h3>
                @if($product->custom_description || data_get($product->snapshot, 'description'))
                    <p>{!! nl2br(e($product->custom_description ?? data_get($product->snapshot, 'description'))) !!}</p>
                @endif
                <div class="product-footer">
                    @if($product->custom_price)
                        <span class="price">{{ number_format($product->custom_price, 2, ',', ' ') }} {{ $product->custom_currency ?? 'CZK' }}</span>
                    @elseif(data_get($product->snapshot, 'price'))
                        <span class="price">{{ data_get($product->snapshot, 'price') }}</span>
                    @endif
                    @if($cartUrl = ($product->cta_url ?? data_get($microsite->settings, 'checkout.stripe_link')))
                        <a class="cta" href="{{ $cartUrl }}" target="_blank" rel="noopener">{{ $product->cta_text ?? 'Koupit' }}</a>
                    @endif
                </div>
            </article>
        @endforeach
    </section>
</body>
</html>
