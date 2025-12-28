<?php

namespace Modules\Core\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Modules\Core\Services\SettingsService;
use Modules\Customers\Services\CustomerGroupService;
use Modules\Customers\Support\CustomerTagConfig;
use Modules\Inventory\Support\InventoryForecastProfile;
use Modules\Inventory\Services\InventoryRecommendationService;
use Modules\Inventory\Support\InventoryNotificationSettings;
use Modules\Pim\Models\ProductVariant;
use Modules\Orders\Models\Order;

class SettingsController extends Controller
{
    private const ANALYTICS_SETTINGS_KEY = 'analytics_settings';
    private const ORDER_STATUS_MAPPING_KEY = 'orders_status_mapping';
    private const CUSTOMERS_SETTINGS_KEY = 'customers_settings';
    private const SLACK_TOKEN_KEY = 'slack_bot_token';
    private const SLACK_SETTINGS_KEY = 'slack_bot_settings';
    private const ELOGIST_SETTINGS_KEY = 'elogist_settings';
    private const ELOGIST_PASSWORD_KEY = 'elogist_password';

    public function __construct(private readonly SettingsService $settings)
    {
    }

    public function showOpenAi()
    {
        $value = $this->settings->getDecrypted('openai_api_key');

        return response()->json([
            'has_key' => $value !== null,
            'last_four' => $value ? Str::substr($value, -4) : null,
        ]);
    }

    public function storeOpenAi(Request $request)
    {
        $data = $request->validate([
            'key' => ['nullable', 'string'],
        ]);

        $this->settings->setEncrypted('openai_api_key', $data['key'] ?? null);

        return $this->showOpenAi();
    }

    public function showGoogleAi()
    {
        $value = $this->settings->getDecrypted('google_ai_api_key');

        return response()->json([
            'has_key' => $value !== null,
            'last_four' => $value ? Str::substr($value, -4) : null,
            'model' => config('services.google_ai.image_model'),
        ]);
    }

    public function storeGoogleAi(Request $request)
    {
        $data = $request->validate([
            'key' => ['nullable', 'string'],
        ]);

        $this->settings->setEncrypted('google_ai_api_key', $data['key'] ?? null);

        return $this->showGoogleAi();
    }

    public function showSlack()
    {
        $value = $this->settings->getDecrypted(self::SLACK_TOKEN_KEY);
        $settings = $this->settings->getJson(self::SLACK_SETTINGS_KEY, $this->defaultSlackSettings());
        $normalized = $this->normalizeSlackSettings($settings);

        return response()->json([
            'has_token' => $value !== null,
            'last_four' => $value ? Str::substr($value, -4) : null,
            'enabled' => (bool) Arr::get($normalized, 'enabled', false),
            'default_channel' => Arr::get($normalized, 'default_channel'),
        ]);
    }

    public function storeSlack(Request $request)
    {
        $data = $request->validate([
            'token' => ['sometimes', 'nullable', 'string'],
            'enabled' => ['sometimes', 'boolean'],
            'default_channel' => ['sometimes', 'nullable', 'string'],
        ]);

        $tokenUpdated = array_key_exists('token', $data);
        $tokenValue = $tokenUpdated ? ($data['token'] ?? null) : null;

        if (array_key_exists('token', $data)) {
            $this->settings->setEncrypted(self::SLACK_TOKEN_KEY, $data['token'] ?? null);
        }

        $currentSettings = $this->settings->getJson(self::SLACK_SETTINGS_KEY, $this->defaultSlackSettings());
        $settings = array_replace($this->defaultSlackSettings(), $currentSettings);

        if (array_key_exists('enabled', $data)) {
            $settings['enabled'] = (bool) $data['enabled'];
        }

        if (array_key_exists('default_channel', $data)) {
            $settings['default_channel'] = $data['default_channel'];
        }

        if ($tokenUpdated && (! is_string($tokenValue) || trim($tokenValue) === '')) {
            $settings['enabled'] = false;
            $settings['default_channel'] = null;
        }

        $normalized = $this->normalizeSlackSettings($settings);

        if ($normalized === $this->defaultSlackSettings()) {
            $this->settings->setJson(self::SLACK_SETTINGS_KEY, []);
        } else {
            $this->settings->setJson(self::SLACK_SETTINGS_KEY, $normalized);
        }

        return $this->showSlack();
    }

    public function showElogist()
    {
        $defaults = $this->elogistDefaults();
        $overrides = $this->settings->getJson(self::ELOGIST_SETTINGS_KEY, []);
        $settings = array_replace($defaults, $overrides);

        $storedPassword = $this->settings->getDecrypted(self::ELOGIST_PASSWORD_KEY);
        $envPassword = config('services.elogist.password');
        $hasPassword = $storedPassword !== null || (is_string($envPassword) && trim($envPassword) !== '');

        return response()->json([
            'wsdl' => $settings['wsdl'],
            'location' => $settings['location'],
            'project_id' => $settings['project_id'],
            'login' => $settings['login'],
            'has_password' => $hasPassword,
            'password_last_four' => $storedPassword ? Str::substr($storedPassword, -4) : ($hasPassword ? '****' : null),
            'using_env_defaults' => [
                'wsdl' => ! array_key_exists('wsdl', $overrides),
                'location' => ! array_key_exists('location', $overrides),
                'project_id' => ! array_key_exists('project_id', $overrides),
                'login' => ! array_key_exists('login', $overrides),
                'password' => $storedPassword === null && $hasPassword,
            ],
        ]);
    }

    public function storeElogist(Request $request)
    {
        $data = $request->validate([
            'wsdl' => ['sometimes', 'nullable', 'string', 'max:500'],
            'location' => ['sometimes', 'nullable', 'string', 'max:500'],
            'project_id' => ['sometimes', 'nullable', 'string', 'max:190'],
            'login' => ['sometimes', 'nullable', 'string', 'max:190'],
            'password' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        $payload = [];

        foreach (['wsdl', 'location', 'project_id', 'login'] as $key) {
            if (array_key_exists($key, $data)) {
                $value = $this->normalizeNullableString($data[$key]);
                if ($value !== null) {
                    $payload[$key] = $value;
                }
            }
        }

        $this->settings->setJson(self::ELOGIST_SETTINGS_KEY, $payload);

        if (array_key_exists('password', $data)) {
            $password = $this->normalizeNullableString($data['password']);
            $this->settings->setEncrypted(self::ELOGIST_PASSWORD_KEY, $password);
        }

        return $this->showElogist();
    }

    private function defaultSlackSettings(): array
    {
        return [
            'enabled' => false,
            'default_channel' => null,
        ];
    }

    private function normalizeSlackSettings(array $settings): array
    {
        $enabled = (bool) Arr::get($settings, 'enabled', false);
        $channel = Arr::get($settings, 'default_channel');

        if (is_string($channel)) {
            $channel = trim($channel);
            $channel = $channel === '' ? null : $channel;
        } else {
            $channel = null;
        }

        return [
            'enabled' => $enabled,
            'default_channel' => $channel,
        ];
    }

    public function showAnalytics()
    {
        return response()->json($this->analyticsSettings());
    }

    public function storeAnalytics(Request $request)
    {
        $defaults = $this->analyticsSettings();

        $data = $request->validate([
            'default_range' => ['sometimes', 'string'],
            'compare_enabled' => ['sometimes', 'boolean'],
            'compare_mode' => ['sometimes', 'string', Rule::in(['previous_period', 'previous_year'])],
            'visible_metrics' => ['sometimes', 'array'],
            'visible_metrics.*' => ['string'],
            'rfm_thresholds' => ['sometimes', 'array'],
            'rfm_thresholds.recency' => ['sometimes', 'array'],
            'rfm_thresholds.recency.*' => ['numeric'],
            'rfm_thresholds.frequency' => ['sometimes', 'array'],
            'rfm_thresholds.frequency.*' => ['numeric'],
            'rfm_thresholds.monetary' => ['sometimes', 'array'],
            'rfm_thresholds.monetary.*' => ['numeric'],
        ]);

        $settings = array_replace_recursive($defaults, $data);

        $this->settings->setJson(self::ANALYTICS_SETTINGS_KEY, $settings);

        return response()->json($settings);
    }

    public function showOrderStatusMapping()
    {
        $mapping = $this->orderStatusMapping();

        return response()->json(array_merge($mapping, [
            'available_statuses' => $this->orderStatusOptions(),
        ]));
    }

    public function storeOrderStatusMapping(Request $request)
    {
        $defaults = $this->orderStatusMapping();

        $data = $request->validate([
            'completed' => ['sometimes', 'array'],
            'completed.*' => ['string'],
            'returned' => ['sometimes', 'array'],
            'returned.*' => ['string'],
            'complaint' => ['sometimes', 'array'],
            'complaint.*' => ['string'],
            'cancelled' => ['sometimes', 'array'],
            'cancelled.*' => ['string'],
        ]);

        $filtered = array_map(function ($statuses) {
            $normalised = array_map(function ($status) {
                if (! is_string($status)) {
                    return null;
                }

                $trimmed = trim($status);

                return $trimmed === '' ? null : $trimmed;
            }, $statuses ?? []);

            $filtered = array_values(array_filter($normalised, static fn ($status) => $status !== null));

            return array_values(array_unique($filtered));
        }, $data);

        $settings = array_replace_recursive($defaults, $filtered);

        $this->settings->setJson(self::ORDER_STATUS_MAPPING_KEY, $settings);

        return response()->json(array_merge($settings, [
            'available_statuses' => $this->orderStatusOptions(),
        ]));
    }

    public function showInventoryForecastProfile()
    {
        $stored = $this->settings->getJson(
            InventoryForecastProfile::SETTINGS_KEY,
            InventoryForecastProfile::defaults()
        );

        return response()->json(InventoryForecastProfile::sanitize($stored));
    }

    public function storeInventoryForecastProfile(Request $request)
    {
        $payload = InventoryForecastProfile::sanitize($request->validate([
            'seasonality' => ['nullable', 'string', Rule::in(['none', 'moderate', 'peaks'])],
            'cashflow_strategy' => ['nullable', 'string', Rule::in(['conserve', 'balanced', 'invest'])],
            'growth_focus' => ['nullable', 'string', Rule::in(['stabilize', 'grow', 'expand'])],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]));

        $this->settings->setJson(InventoryForecastProfile::SETTINGS_KEY, $payload);

        return response()->json($payload);
    }

    public function showInventoryRecommendationSettings(InventoryRecommendationService $recommendations)
    {
        return response()->json($recommendations->getConfiguration());
    }

    public function storeInventoryRecommendationSettings(
        Request $request,
        InventoryRecommendationService $recommendations
    ) {
        $data = $request->validate([
            'descriptors' => ['sometimes', 'array'],
            'descriptors.*' => ['nullable', 'numeric'],
            'filters' => ['sometimes', 'array'],
            'filters.*' => ['nullable', 'numeric'],
            'related_products' => ['sometimes', 'array'],
            'related_products.*' => ['nullable', 'numeric'],
            'stock' => ['sometimes', 'array'],
            'stock.must_have_stock' => ['sometimes', 'boolean'],
            'stock.weight' => ['sometimes', 'numeric'],
            'sales' => ['sometimes', 'array'],
            'sales.last_30_quantity_weight' => ['sometimes', 'numeric'],
            'sales.last_90_quantity_weight' => ['sometimes', 'numeric'],
            'price' => ['sometimes', 'array'],
            'price.allowed_diff_percent' => ['sometimes', 'numeric'],
            'price.match_weight' => ['sometimes', 'numeric'],
            'price.cheaper_bonus' => ['sometimes', 'numeric'],
            'candidate_limit' => ['sometimes', 'integer', 'min:1', 'max:500'],
        ]);

        $payload = [];

        if (array_key_exists('descriptors', $data)) {
            $payload['descriptors'] = $data['descriptors'] ?? [];
        }
        if (array_key_exists('filters', $data)) {
            $payload['filters'] = $data['filters'] ?? [];
        }
        if (array_key_exists('related_products', $data)) {
            $payload['related_products'] = $data['related_products'] ?? [];
        }
        if (array_key_exists('stock', $data)) {
            $payload['stock'] = $data['stock'] ?? [];
        }
        if (array_key_exists('sales', $data)) {
            $payload['sales'] = $data['sales'] ?? [];
        }
        if (array_key_exists('price', $data)) {
            $payload['price'] = $data['price'] ?? [];
        }
        if (array_key_exists('candidate_limit', $data)) {
            $payload['candidate_limit'] = $data['candidate_limit'];
        }

        $config = $recommendations->saveConfiguration($payload);

        return response()->json($config);
    }

    public function showCustomerSettings()
    {
        return response()->json($this->customerSettings());
    }

    public function storeCustomerSettings(Request $request)
    {
        $defaults = $this->customerSettings();

        $data = $request->validate([
            'auto_create_guest' => ['sometimes', 'boolean'],
            'auto_register_guest' => ['sometimes', 'boolean'],
            'group_labels' => ['sometimes', 'array'],
            'group_labels.registered' => ['nullable', 'string', 'max:120'],
            'group_labels.guest' => ['nullable', 'string', 'max:120'],
            'group_labels.company' => ['nullable', 'string', 'max:120'],
            'group_labels.vip' => ['nullable', 'string', 'max:120'],
            'group_aliases' => ['sometimes', 'array'],
            'group_aliases.registered' => ['sometimes', 'array'],
            'group_aliases.registered.*' => ['nullable', 'string', 'max:120'],
            'group_aliases.guest' => ['sometimes', 'array'],
            'group_aliases.guest.*' => ['nullable', 'string', 'max:120'],
            'group_aliases.company' => ['sometimes', 'array'],
            'group_aliases.company.*' => ['nullable', 'string', 'max:120'],
        ]);

        $settings = array_replace_recursive($defaults, $data);
        $settings['group_labels'] = CustomerTagConfig::sanitizeLabels($settings['group_labels'] ?? []);
        $settings['group_aliases'] = CustomerTagConfig::sanitizeAliases($settings['group_aliases'] ?? []);

        $this->settings->setJson(self::CUSTOMERS_SETTINGS_KEY, $settings);
        app(CustomerGroupService::class)->refresh();

        return response()->json($this->customerSettings());
    }

    public function showInventoryNotificationSettings()
    {
        $settings = InventoryNotificationSettings::sanitize($this->settings->getJson(
            InventoryNotificationSettings::SETTINGS_KEY,
            InventoryNotificationSettings::defaults()
        ));

        return response()->json($this->inventoryNotificationSettingsResponse($settings));
    }

    public function storeInventoryNotificationSettings(Request $request)
    {
        $payload = InventoryNotificationSettings::sanitize($request->validate([
            'low_stock_threshold' => ['nullable', 'numeric', 'min:0', 'max:100000'],
            'watch_variant_ids' => ['nullable', 'array'],
            'watch_variant_ids.*' => ['string'],
        ]));

        $variantIds = $payload['watch_variant_ids'] ?? [];

        if ($variantIds !== []) {
            $existing = ProductVariant::query()
                ->whereIn('id', $variantIds)
                ->pluck('id')
                ->all();

            $missing = array_values(array_diff($variantIds, $existing));

            if ($missing !== []) {
                throw ValidationException::withMessages([
                    'watch_variant_ids' => 'Vybrané varianty nebyly nalezeny.',
                ]);
            }
        }

        $this->settings->setJson(InventoryNotificationSettings::SETTINGS_KEY, $payload);

        return response()->json($this->inventoryNotificationSettingsResponse($payload));
    }

    private function analyticsSettings(): array
    {
        $defaults = [
            'default_range' => 'last_30_days',
            'compare_enabled' => true,
            'compare_mode' => 'previous_period',
            'visible_metrics' => [
                'orders_total',
                'orders_total_value',
                'orders_average_value',
                'customers_total',
            ],
            'rfm_thresholds' => [
                'recency' => [30, 60, 90],
                'frequency' => [1, 3, 5],
                'monetary' => [1000, 3000, 7000],
            ],
        ];

        return $this->settings->getJson(self::ANALYTICS_SETTINGS_KEY, $defaults);
    }

    private function orderStatusMapping(): array
    {
        $defaults = [
            'completed' => [],
            'returned' => [],
            'complaint' => [],
            'cancelled' => [],
        ];

        return $this->settings->getJson(self::ORDER_STATUS_MAPPING_KEY, $defaults);
    }

    private function orderStatusOptions(): array
    {
        return Order::query()
            ->whereNotNull('status')
            ->select('status')
            ->distinct()
            ->orderBy('status')
            ->pluck('status')
            ->filter()
            ->values()
            ->all();
    }

    private function inventoryNotificationSettingsResponse(array $settings): array
    {
        $variantIds = $settings['watch_variant_ids'] ?? [];
        $watchVariants = [];

        if ($variantIds !== []) {
            $variants = ProductVariant::query()
                ->with(['product.shop'])
                ->whereIn('id', $variantIds)
                ->get()
                ->keyBy('id');

            foreach ($variantIds as $variantId) {
                $variant = $variants->get($variantId);

                if (! $variant) {
                    continue;
                }

                $watchVariants[] = [
                    'id' => $variant->id,
                    'code' => $variant->code,
                    'sku' => $variant->sku,
                    'name' => $variant->name,
                    'stock' => $variant->stock,
                    'min_stock_supply' => $variant->min_stock_supply,
                    'stock_status' => $variant->stock_status,
                    'unit' => $variant->unit,
                    'product' => [
                        'id' => $variant->product?->id,
                        'sku' => $variant->product?->sku,
                        'name' => Arr::get($variant->product?->base_payload ?? [], 'name'),
                    ],
                    'shop' => [
                        'id' => $variant->product?->shop?->id,
                        'name' => $variant->product?->shop?->name,
                    ],
                ];
            }
        }

        return [
            'low_stock_threshold' => $settings['low_stock_threshold'] ?? 0,
            'watch_variant_ids' => $variantIds,
            'watch_variants' => $watchVariants,
        ];
    }

    private function elogistDefaults(): array
    {
        return [
            'wsdl' => config('services.elogist.wsdl'),
            'location' => config('services.elogist.location'),
            'project_id' => config('services.elogist.project_id'),
            'login' => config('services.elogist.login'),
        ];
    }

    private function normalizeNullableString(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }

    private function customerSettings(): array
    {
        $defaults = [
            'auto_create_guest' => true,
            'auto_register_guest' => false,
            'group_labels' => CustomerTagConfig::defaultLabels(),
            'group_aliases' => CustomerTagConfig::defaultAliases(),
        ];

        $stored = $this->settings->getJson(self::CUSTOMERS_SETTINGS_KEY, []);
        $settings = array_replace_recursive($defaults, is_array($stored) ? $stored : []);

        $labels = CustomerTagConfig::sanitizeLabels($settings['group_labels'] ?? []);
        $aliases = CustomerTagConfig::sanitizeAliases($settings['group_aliases'] ?? []);

        return [
            'auto_create_guest' => (bool) $settings['auto_create_guest'],
            'auto_register_guest' => (bool) $settings['auto_register_guest'],
            'group_labels' => $labels,
            'group_aliases' => $aliases,
        ];
    }
}
