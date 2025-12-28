<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Mockery;
use Modules\Core\Models\AppSetting;
use Modules\Pim\Models\ShopCategoryNode;
use Modules\Pim\Services\CategoryProductPriorityService;
use Modules\Shoptet\Models\Shop;
use Tests\TestCase;

class CategoryProductPriorityAiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware();
    }

    protected function tearDown(): void
    {
        Mockery::close();

        parent::tearDown();
    }

    public function test_it_returns_ai_priority_suggestions(): void
    {
        AppSetting::create([
            'key' => 'openai_api_key',
            'value' => Crypt::encryptString('sk-test'),
        ]);

        $shop = Shop::create([
            'name' => 'Test Shop',
            'domain' => 'test-shop.cz',
            'default_locale' => 'cs_CZ',
            'timezone' => 'Europe/Prague',
            'locale' => 'cs_CZ',
            'api_mode' => 'premium',
            'currency_code' => 'CZK',
        ]);

        ShopCategoryNode::create([
            'id' => (string) Str::uuid(),
            'shop_id' => $shop->id,
            'remote_guid' => 'cat-guid',
            'name' => 'Parfémy',
            'path' => 'Parfémy',
            'position' => 1,
        ]);

        $mock = Mockery::mock(CategoryProductPriorityService::class);
        $mock->shouldReceive('fetch')
            ->once()
            ->withArgs(function ($givenShop, $categoryGuid, $page, $perPage) use ($shop) {
                return $givenShop instanceof Shop
                    && $givenShop->is($shop)
                    && $categoryGuid === 'cat-guid'
                    && $page === 1
                    && $perPage === 20;
            })
            ->andReturn([
                'data' => [
                    'items' => [
                        [
                            'position' => 1,
                            'product_guid' => 'prod-1',
                            'product_id' => 'p-1',
                            'sku' => 'SKU1',
                            'name' => 'Parfém A',
                            'priority' => 10,
                            'stock' => 15,
                            'purchases_30d' => 34,
                            'variants' => [
                                [
                                    'variant_id' => 'v-1',
                                    'code' => 'VAR1',
                                    'name' => '50 ml',
                                    'stock' => 10,
                                    'purchases_30d' => 20,
                                ],
                            ],
                        ],
                        [
                            'position' => 2,
                            'product_guid' => 'prod-2',
                            'product_id' => 'p-2',
                            'sku' => 'SKU2',
                            'name' => 'Parfém B',
                            'priority' => 20,
                            'stock' => 0,
                            'purchases_30d' => 5,
                            'variants' => [],
                        ],
                    ],
                    'paginator' => [
                        'total' => 2,
                        'page' => 1,
                        'page_count' => 1,
                        'per_page' => 20,
                        'items_on_page' => 2,
                    ],
                ],
                'errors' => [],
            ]);

        $this->app->instance(CategoryProductPriorityService::class, $mock);

        Http::fake([
            'https://api.openai.com/v1/chat/completions' => Http::response([
                'choices' => [
                    [
                        'message' => [
                            'content' => json_encode([
                                'criteria' => 'Upřednostněny byly produkty s prodeji a skladem, vyprodané kusy jsou níže.',
                                'items' => [
                                    [
                                        'product_guid' => 'prod-1',
                                        'suggested_priority' => 1,
                                        'rationale' => 'Nejvyšší prodeje za 30 dní a stále dostupný sklad.',
                                    ],
                                    [
                                        'product_guid' => 'prod-2',
                                        'suggested_priority' => 30,
                                        'rationale' => 'Nízká prodejnost a nulový sklad, produkt by měl být níže.',
                                    ],
                                ],
                            ], JSON_UNESCAPED_UNICODE),
                        ],
                    ],
                ],
            ], 200),
        ]);

        $response = $this->postJson('/api/pim/products/category-priority/ai-evaluate', [
            'shop_id' => $shop->id,
            'category_guid' => 'cat-guid',
            'pages' => 2,
            'per_page' => 20,
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.model', 'gpt-4o-mini')
            ->assertJsonPath('data.product_count', 2)
            ->assertJsonPath('data.criteria', 'Upřednostněny byly produkty s prodeji a skladem, vyprodané kusy jsou níže.')
            ->assertJsonPath('data.suggestions.0.product_guid', 'prod-1')
            ->assertJsonPath('data.suggestions.0.suggested_priority', 1)
            ->assertJsonPath('data.suggestions.1.product_guid', 'prod-2')
            ->assertJsonPath('data.suggestions.1.suggested_priority', 30)
            ->assertJsonPath('data.suggestions.1.rationale', 'Nízká prodejnost a nulový sklad, produkt by měl být níže.');

        $this->assertNotNull($response->json('data.evaluated_at'));

        Http::assertSent(function ($request) {
            $data = $request->data();

            return data_get($data, 'messages.0.role') === 'system'
                && data_get($data, 'messages.1.role') === 'user'
                && str_contains(data_get($data, 'messages.1.content'), 'prod-1')
                && data_get($data, 'response_format.json_schema.name') === 'category_product_priority';
        });
    }
}
