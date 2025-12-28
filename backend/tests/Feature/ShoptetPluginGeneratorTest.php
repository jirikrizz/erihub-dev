<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Modules\Core\Models\AppSetting;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Models\ShoptetPlugin;
use Modules\Shoptet\Models\ShoptetPluginTemplate;
use Modules\Shoptet\Models\ShoptetPluginVersion;
use Tests\TestCase;

class ShoptetPluginGeneratorTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware();
    }

    public function test_it_generates_plugin_via_openai(): void
    {
        AppSetting::create([
            'key' => 'openai_api_key',
            'value' => Crypt::encryptString('sk-test'),
        ]);

        $shop = Shop::create([
            'name' => 'Demo Shop',
            'domain' => 'demo-shop.cz',
            'default_locale' => 'cs_CZ',
            'timezone' => 'Europe/Prague',
            'locale' => 'cs_CZ',
            'api_mode' => 'premium',
            'currency_code' => 'CZK',
        ]);

        $template = ShoptetPluginTemplate::create([
            'name' => 'Test Template',
            'plugin_type' => 'banner',
            'goal' => 'Goal',
            'language' => 'cs',
            'is_system' => false,
        ]);

        Http::fake([
            'https://api.openai.com/v1/chat/completions' => Http::response([
                'choices' => [
                    [
                        'message' => [
                            'content' => json_encode([
                                'summary' => 'Widget pro zvýraznění dopravy zdarma.',
                                'file' => [
                                    'filename' => 'free-shipping-widget.js',
                                    'description' => 'Zobrazí upozornění na dopravu zdarma nad určitou částku.',
                                    'code' => "(() => { console.log('hello'); })();",
                                ],
                                'installation_steps' => ['Vlož skript do Shoptet administrace.'],
                                'testing_checklist' => ['Ověř, že se widget zobrazuje na detailu produktu.'],
                                'dependencies' => [],
                                'warnings' => ['Nezapomeň aktualizovat částku dopravy zdarma.'],
                            ], JSON_UNESCAPED_UNICODE),
                        ],
                    ],
                ],
            ], 200),
        ]);

        $payload = [
            'name' => 'Widget doprava zdarma',
            'goal' => 'Zvýrazni dopravu zdarma při objednávce nad 1500 Kč.',
            'shop_id' => $shop->id,
            'plugin_type' => 'banner',
            'template_id' => $template->id,
            'shoptet_surface' => 'detail produktu',
            'data_sources' => 'Použij DOM prvky s třídou .product-detail__price.',
            'additional_notes' => 'Responzivní widget, který nezasahuje do layoutu.',
            'language' => 'sk',
            'brand_primary_color' => '#FF6600',
            'brand_secondary_color' => '#1A1A1A',
            'brand_font_family' => 'Roboto, sans-serif',
        ];

        $response = $this->postJson('/api/shoptet/plugins/generate', $payload);

        $response
            ->assertOk()
            ->assertJsonFragment([
                'summary' => 'Widget pro zvýraznění dopravy zdarma.',
            ])
            ->assertJsonPath('file.filename', 'free-shipping-widget.js')
            ->assertJsonPath('file.description', 'Zobrazí upozornění na dopravu zdarma nad určitou částku.')
            ->assertJsonPath('installation_steps.0', 'Vlož skript do Shoptet administrace.')
            ->assertJsonPath('testing_checklist.0', 'Ověř, že se widget zobrazuje na detailu produktu.')
            ->assertJsonPath('warnings.0', 'Nezapomeň aktualizovat částku dopravy zdarma.')
            ->assertJsonPath('plugin_id', fn ($value) => $value !== null)
            ->assertJsonPath('version', 1)
            ->assertJsonPath('shop_id', $shop->id)
            ->assertJsonPath('metadata.plugin_type', 'banner')
            ->assertJsonPath('metadata.template_id', $template->id)
            ->assertJsonPath('metadata.language', 'sk')
            ->assertJsonPath('metadata.brand.primary_color', '#FF6600');

        $this->assertDatabaseHas('shoptet_plugins', [
            'shop_id' => $shop->id,
            'name' => 'Widget doprava zdarma',
        ]);

        $plugin = ShoptetPlugin::firstWhere([
            'shop_id' => $shop->id,
            'name' => 'Widget doprava zdarma',
        ]);

        $this->assertNotNull($plugin);

        $this->assertDatabaseHas('shoptet_plugin_versions', [
            'plugin_id' => $plugin->id,
            'version' => 1,
            'filename' => 'free-shipping-widget.js',
        ]);

        $this->assertSame('sk', $plugin->versions()->first()->metadata['language']);

        Http::assertSent(function ($request) use ($payload) {
            $body = $request->data();
            $userContent = data_get($body, 'messages.1.content', '');

            return data_get($body, 'messages.0.role') === 'system'
                && data_get($body, 'messages.1.role') === 'user'
                && str_contains($userContent, $payload['name'])
                && str_contains($userContent, $payload['goal'])
                && str_contains($userContent, $payload['shoptet_surface']);
        });
    }

    public function test_it_returns_error_when_api_key_missing(): void
    {
        $shop = Shop::create([
            'name' => 'Test Shop',
            'domain' => 'test-shop.cz',
            'default_locale' => 'cs_CZ',
            'timezone' => 'Europe/Prague',
            'locale' => 'cs_CZ',
            'api_mode' => 'premium',
            'currency_code' => 'CZK',
        ]);

        $response = $this->postJson('/api/shoptet/plugins/generate', [
            'name' => 'Widget',
            'goal' => 'Něco udělej.',
            'shop_id' => $shop->id,
            'plugin_type' => 'banner',
        ]);

        $response
            ->assertStatus(422)
            ->assertJson([
                'message' => 'OpenAI API klíč není uložen. Přidej ho v Nastavení → Překládání.',
            ]);
    }

    public function test_it_creates_new_version_for_existing_plugin(): void
    {
        AppSetting::create([
            'key' => 'openai_api_key',
            'value' => Crypt::encryptString('sk-test'),
        ]);

        $shop = Shop::create([
            'name' => 'Master Shop',
            'domain' => 'master-shop.cz',
            'default_locale' => 'cs_CZ',
            'timezone' => 'Europe/Prague',
            'locale' => 'cs_CZ',
            'api_mode' => 'premium',
            'currency_code' => 'CZK',
        ]);

        $plugin = ShoptetPlugin::create([
            'shop_id' => $shop->id,
            'name' => 'Floating Banner',
        ]);

        ShoptetPluginVersion::create([
            'plugin_id' => $plugin->id,
            'version' => 1,
            'filename' => 'banner.js',
            'summary' => 'First version',
            'description' => 'Initial release',
            'code' => 'console.log("v1");',
            'installation_steps' => ['Step 1'],
            'testing_checklist' => ['Check 1'],
            'dependencies' => [],
            'warnings' => [],
        ]);

        Http::fake([
            'https://api.openai.com/v1/chat/completions' => Http::response([
                'choices' => [
                    [
                        'message' => [
                            'content' => json_encode([
                                'summary' => 'Vylepšený banner.',
                                'file' => [
                                    'filename' => 'floating-banner-v2.js',
                                    'description' => 'Přidává animace a další CTA.',
                                    'code' => "(() => { console.log('v2'); })();",
                                ],
                                'installation_steps' => ['Nahraj nový skript.'],
                                'testing_checklist' => ['Zkontroluj, že animace běží.'],
                                'dependencies' => ['IntersectionObserver'],
                                'warnings' => [],
                            ], JSON_UNESCAPED_UNICODE),
                        ],
                    ],
                ],
            ], 200),
        ]);

        $response = $this->postJson('/api/shoptet/plugins/generate', [
            'name' => 'Floating Banner',
            'goal' => 'Vytvoř vylepšenou verzi banneru.',
            'shop_id' => $shop->id,
            'plugin_type' => 'function',
            'language' => 'cs',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('version', 2)
            ->assertJsonPath('plugin_id', $plugin->id)
            ->assertJsonPath('file.filename', 'floating-banner-v2.js');

        $this->assertDatabaseHas('shoptet_plugin_versions', [
            'plugin_id' => $plugin->id,
            'version' => 2,
            'filename' => 'floating-banner-v2.js',
        ]);

        $latest = $plugin->versions()->where('version', 2)->first();
        $this->assertSame('function', $latest->metadata['plugin_type'] ?? null);
        $this->assertSame('cs', $latest->metadata['language'] ?? null);
    }
}
