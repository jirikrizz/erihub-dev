<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Shoptet\Models\ShoptetPluginTemplate;
use Tests\TestCase;

class ShoptetPluginTemplateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware();
    }

    public function test_it_lists_templates(): void
    {
        ShoptetPluginTemplate::factory()->create(['name' => 'Template A']);

        $response = $this->getJson('/api/shoptet/plugin-templates');

        $response
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Template A');
    }

    public function test_it_creates_template(): void
    {
        $payload = [
            'name' => 'Promo banner',
            'plugin_type' => 'banner',
            'language' => 'cs',
            'goal' => 'Zobraz CTA banner.',
            'description' => 'Test popis',
            'brand_primary_color' => '#FF0000',
        ];

        $response = $this->postJson('/api/shoptet/plugin-templates', $payload);

        $response
            ->assertCreated()
            ->assertJsonPath('name', 'Promo banner');

        $this->assertDatabaseHas('shoptet_plugin_templates', ['name' => 'Promo banner']);
    }

    public function test_it_updates_template(): void
    {
        $template = ShoptetPluginTemplate::create([
            'name' => 'Old name',
            'plugin_type' => 'function',
            'goal' => 'Something',
        ]);

        $payload = [
            'name' => 'New name',
            'plugin_type' => 'function',
            'goal' => 'Updated goal',
        ];

        $response = $this->putJson("/api/shoptet/plugin-templates/{$template->id}", $payload);

        $response
            ->assertOk()
            ->assertJsonPath('name', 'New name');

        $this->assertDatabaseHas('shoptet_plugin_templates', ['id' => $template->id, 'goal' => 'Updated goal']);
    }

    public function test_it_prevents_deleting_system_template(): void
    {
        $template = ShoptetPluginTemplate::create([
            'name' => 'System',
            'plugin_type' => 'banner',
            'goal' => 'Goal',
            'is_system' => true,
        ]);

        $this->deleteJson("/api/shoptet/plugin-templates/{$template->id}")
            ->assertForbidden();
    }
}
