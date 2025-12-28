<?php

namespace Modules\WooCommerce\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Arr;
use Illuminate\Validation\Rule;
use Modules\Shoptet\Models\Shop;
use Modules\WooCommerce\Models\WooCommerceShop;

class ShopController extends Controller
{
    public function index(Request $request)
    {
        $query = Shop::query();

        if (Shop::hasProviderColumn()) {
            $query->where('provider', 'woocommerce');
        } else {
            $query->whereRaw('1 = 0');
        }

        $shops = $query
            ->with(['woocommerce', 'customerLinkTarget:id,name'])
            ->paginate($request->integer('per_page', 25));

        return response()->json($shops);
    }

    public function store(Request $request)
    {
        $shoptetRule = Rule::exists('shops', 'id');

        if (Shop::hasProviderColumn()) {
            $shoptetRule = $shoptetRule->where(fn ($query) => $query->where('provider', 'shoptet'));
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'base_url' => ['required', 'string', 'max:255'],
            'currency_code' => ['required', 'string', 'max:8'],
            'timezone' => ['nullable', 'string', 'max:100'],
            'locale' => ['nullable', 'string', 'max:12'],
            'customer_link_shop_id' => [
                'nullable',
                'integer',
                $shoptetRule,
            ],
            'api_version' => ['nullable', 'string', 'max:32'],
            'consumer_key' => ['required', 'string'],
            'consumer_secret' => ['required', 'string'],
        ]);

        $sanitizedUrl = $this->normalizeBaseUrl($data['base_url']);

        $shop = Shop::create([
            'name' => $data['name'],
            'provider' => 'woocommerce',
            'domain' => $this->extractDomain($sanitizedUrl),
            'default_locale' => $data['locale'] ?? config('pim.default_base_locale'),
            'timezone' => $data['timezone'] ?? 'Europe/Prague',
            'locale' => $data['locale'] ?? config('pim.default_base_locale'),
            'currency_code' => strtoupper($data['currency_code']),
            'settings' => [
                'platform' => 'woocommerce',
            ],
            'customer_link_shop_id' => $data['customer_link_shop_id'] ?? null,
        ]);

        $shop->woocommerce()->create([
            'base_url' => $sanitizedUrl,
            'api_version' => $data['api_version'] ?? config('woocommerce.api_version', 'wc/v3'),
            'consumer_key' => $data['consumer_key'],
            'consumer_secret' => $data['consumer_secret'],
        ]);

        return response()->json($shop->load(['woocommerce', 'customerLinkTarget:id,name']), 201);
    }

    public function show(Shop $woocommerceShop)
    {
        return response()->json($woocommerceShop->load(['woocommerce', 'customerLinkTarget:id,name']));
    }

    public function update(Request $request, Shop $woocommerceShop)
    {
        $shoptetRule = Rule::exists('shops', 'id');

        if (Shop::hasProviderColumn()) {
            $shoptetRule = $shoptetRule->where(fn ($query) => $query->where('provider', 'shoptet'));
        }

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'base_url' => ['sometimes', 'string', 'max:255'],
            'currency_code' => ['sometimes', 'string', 'max:8'],
            'timezone' => ['nullable', 'string', 'max:100'],
            'locale' => ['nullable', 'string', 'max:12'],
            'customer_link_shop_id' => [
                'nullable',
                'integer',
                $shoptetRule,
            ],
            'api_version' => ['nullable', 'string', 'max:32'],
            'consumer_key' => ['nullable', 'string'],
            'consumer_secret' => ['nullable', 'string'],
        ]);

        $shopData = Arr::only($data, [
            'name',
            'currency_code',
            'timezone',
            'locale',
            'customer_link_shop_id',
        ]);

        if (isset($data['base_url'])) {
            $sanitizedUrl = $this->normalizeBaseUrl($data['base_url']);
            $shopData['domain'] = $this->extractDomain($sanitizedUrl);
        }

        if ($shopData !== []) {
            if (isset($shopData['currency_code'])) {
                $shopData['currency_code'] = strtoupper((string) $shopData['currency_code']);
            }

            $woocommerceShop->fill($shopData);
            $woocommerceShop->save();
        }

        /** @var WooCommerceShop|null $connection */
        $connection = $woocommerceShop->woocommerce()->firstOrNew([]);

        if (isset($sanitizedUrl)) {
            $connection->base_url = $sanitizedUrl;
        }

        if (! empty($data['api_version'])) {
            $connection->api_version = $data['api_version'];
        }

        if (! empty($data['consumer_key'])) {
            $connection->consumer_key = $data['consumer_key'];
        }

        if (! empty($data['consumer_secret'])) {
            $connection->consumer_secret = $data['consumer_secret'];
        }

        $connection->shop()->associate($woocommerceShop);
        $connection->save();

        return response()->json($woocommerceShop->load(['woocommerce', 'customerLinkTarget:id,name']));
    }

    public function destroy(Shop $woocommerceShop)
    {
        $woocommerceShop->delete();

        return response()->json(['message' => 'Shop odstraněn.']);
    }

    private function normalizeBaseUrl(string $url): string
    {
        $trimmed = trim($url);

        if ($trimmed === '') {
            throw new \InvalidArgumentException('Base URL cannot be empty.');
        }

        if (! str_contains($trimmed, '://')) {
            $trimmed = 'https://'.$trimmed;
        }

        return rtrim($trimmed, '/');
    }

    private function extractDomain(string $url): string
    {
        $host = parse_url($url, PHP_URL_HOST);

        if (! $host) {
            return rtrim(preg_replace('~^https?://~', '', $url), '/');
        }

        return $host;
    }
}
