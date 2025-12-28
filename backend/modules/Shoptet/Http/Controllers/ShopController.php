<?php

namespace Modules\Shoptet\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Arr;
use Illuminate\Validation\Rule;
use Modules\Shoptet\Contracts\ShoptetClient;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Services\WebhookRegistrationService;

class ShopController extends Controller
{
    public function __construct(
        private readonly ShoptetClient $client,
        private readonly WebhookRegistrationService $webhookRegistrationService
    )
    {
    }

    public function index(Request $request)
    {
        $provider = strtolower((string) $request->query('provider', 'shoptet'));
        $hasProviderColumn = Shop::hasProviderColumn();

        $shopsQuery = Shop::query();

        if ($hasProviderColumn) {
            if ($provider === '' || $provider === 'shoptet') {
                $shopsQuery->where('provider', 'shoptet');
            } elseif ($provider !== 'all') {
                $shopsQuery->where('provider', $provider);
            }
        }

        $shops = $shopsQuery
            ->with('token')
            ->paginate($request->integer('per_page', 25));

        return response()->json($shops);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'domain' => ['required', 'string', 'max:255', 'unique:shops,domain'],
            'default_locale' => ['nullable', 'string'],
            'timezone' => ['nullable', 'string'],
            'api_mode' => ['nullable', Rule::in(['premium', 'private', 'partner'])],
            'is_master' => ['nullable', 'boolean'],
            'settings' => ['nullable', 'array'],
            'locale' => ['nullable', 'string', 'max:12'],
            'currency_code' => ['nullable', 'string', 'max:8'],
            'private_api_token' => ['required', 'string'],
        ]);

        $shop = Shop::create([
            'name' => $data['name'],
            'provider' => 'shoptet',
            'domain' => $this->normalizeDomain($data['domain']),
            'default_locale' => $data['default_locale'] ?? config('pim.default_base_locale'),
            'timezone' => $data['timezone'] ?? 'Europe/Prague',
            'api_mode' => $data['api_mode'] ?? 'premium',
            'locale' => $data['locale'] ?? $data['default_locale'] ?? config('pim.default_base_locale'),
            'currency_code' => $data['currency_code'] ?? 'CZK',
            'is_master' => (bool) ($data['is_master'] ?? false),
            'settings' => $data['settings'] ?? null,
        ]);

        $shop->token()->updateOrCreate([], [
            'access_token' => $data['private_api_token'],
            'refresh_token' => null,
            'expires_at' => null,
        ]);

        $this->webhookRegistrationService->ensureJobFinishedWebhook($shop);

        $this->ensureSingleMaster($shop);

        return response()->json($shop->load(['token', 'webhookJobs' => fn ($query) => $query->latest()->limit(5)]), 201);
    }

    public function show(Shop $shop)
    {
        return response()->json($shop->load(['token', 'webhookJobs' => fn ($query) => $query->latest()->limit(10)]));
    }

    public function update(Request $request, Shop $shop)
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'domain' => ['sometimes', 'string', 'max:255', 'unique:shops,domain,' . $shop->id],
            'default_locale' => ['nullable', 'string'],
            'timezone' => ['nullable', 'string'],
            'api_mode' => ['nullable', Rule::in(['premium', 'private', 'partner'])],
            'is_master' => ['nullable', 'boolean'],
            'settings' => ['nullable', 'array'],
            'locale' => ['nullable', 'string', 'max:12'],
            'currency_code' => ['nullable', 'string', 'max:8'],
            'private_api_token' => ['nullable', 'string'],
        ]);

        $shop->fill(Arr::only($data, [
            'name',
            'default_locale',
            'timezone',
            'api_mode',
            'is_master',
            'settings',
            'locale',
            'currency_code',
            'customer_link_shop_id',
        ]));

        if (isset($data['domain'])) {
            $shop->domain = $this->normalizeDomain($data['domain']);
        }

        $shop->save();

        if (! empty($data['private_api_token'])) {
            $shop->token()->updateOrCreate([], [
                'access_token' => $data['private_api_token'],
                'refresh_token' => null,
                'expires_at' => null,
            ]);

            $this->webhookRegistrationService->ensureJobFinishedWebhook($shop);
        }

        $this->ensureSingleMaster($shop);

        return response()->json($shop->refresh()->load('token'));
    }

    public function refreshToken(Shop $shop)
    {
        $payload = $this->client->refreshAccessToken($shop);

        return response()->json(['data' => $payload]);
    }

    public function destroy(Shop $shop)
    {
        $shop->delete();

        return response()->json(['message' => 'Shop odstraněn.']);
    }

    public function webhookStatus(Shop $shop)
    {
        $registered = $this->webhookRegistrationService->hasJobFinishedWebhook($shop);

        return response()->json([
            'registered' => $registered,
        ]);
    }

    public function registerWebhook(Shop $shop)
    {
        $this->webhookRegistrationService->ensureJobFinishedWebhook($shop);
        $registered = $this->webhookRegistrationService->hasJobFinishedWebhook($shop);

        return response()->json([
            'registered' => $registered,
        ]);
    }

    private function normalizeDomain(string $domain): string
    {
        $domain = trim($domain);
        $domain = preg_replace('~^https?://~', '', $domain);
        return rtrim($domain, '/');
    }

    private function ensureSingleMaster(Shop $shop): void
    {
        if (! $shop->is_master) {
            return;
        }

        Shop::where('id', '!=', $shop->id)->update(['is_master' => false]);
    }
}
