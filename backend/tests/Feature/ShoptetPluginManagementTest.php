<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Models\ShoptetPlugin;
use Modules\Shoptet\Models\ShoptetPluginVersion;
use Tests\TestCase;

class ShoptetPluginManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware();
    }

    public function test_it_lists_plugins_with_latest_version(): void
    {
        $shop = Shop::create([
            'name' => 'Alpha',
            'domain' => 'alpha.cz',
            'default_locale' => 'cs_CZ',
            'timezone' => 'Europe/Prague',
            'locale' => 'cs_CZ',
            'api_mode' => 'premium',
            'currency_code' => 'CZK',
        ]);

        $plugin = ShoptetPlugin::create([
            'shop_id' => $shop->id,
            'name' => 'Promo Widget',
        ]);

        ShoptetPluginVersion::create([
            'plugin_id' => $plugin->id,
            'version' => 1,
            'filename' => 'promo-v1.js',
            'summary' => 'First release',
            'description' => null,
            'code' => 'console.log("v1");',
        ]);

        ShoptetPluginVersion::create([
            'plugin_id' => $plugin->id,
            'version' => 2,
            'filename' => 'promo-v2.js',
            'summary' => 'Second release',
            'description' => null,
            'code' => 'console.log("v2");',
        ]);

        $response = $this->getJson('/api/shoptet/plugins');

        $response
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Promo Widget')
            ->assertJsonPath('data.0.latest_version', 2)
            ->assertJsonPath('data.0.latest_filename', 'promo-v2.js');
    }

    public function test_it_updates_plugin(): void
    {
        $shop = Shop::create([
            'name' => 'Delta',
            'domain' => 'delta.cz',
            'default_locale' => 'cs_CZ',
            'timezone' => 'Europe/Prague',
            'locale' => 'cs_CZ',
            'api_mode' => 'premium',
            'currency_code' => 'CZK',
        ]);

        $plugin = ShoptetPlugin::create([
            'shop_id' => $shop->id,
            'name' => 'Old Plugin',
        ]);

        $response = $this->putJson("/api/shoptet/plugins/{$plugin->id}", [
            'name' => 'New Plugin',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('name', 'New Plugin');

        $this->assertDatabaseHas('shoptet_plugins', ['id' => $plugin->id, 'name' => 'New Plugin']);
    }

    public function test_it_deletes_plugin(): void
    {
        $shop = Shop::create([
            'name' => 'Epsilon',
            'domain' => 'epsilon.cz',
            'default_locale' => 'cs_CZ',
            'timezone' => 'Europe/Prague',
            'locale' => 'cs_CZ',
            'api_mode' => 'premium',
            'currency_code' => 'CZK',
        ]);

        $plugin = ShoptetPlugin::create([
            'shop_id' => $shop->id,
            'name' => 'Temp Plugin',
        ]);

        ShoptetPluginVersion::create([
            'plugin_id' => $plugin->id,
            'version' => 1,
            'filename' => 'temp.js',
            'summary' => 'summary',
            'description' => null,
            'code' => 'console.log("temp");',
        ]);

        $this->deleteJson("/api/shoptet/plugins/{$plugin->id}")
            ->assertOk();

        $this->assertDatabaseMissing('shoptet_plugins', ['id' => $plugin->id]);
        $this->assertDatabaseMissing('shoptet_plugin_versions', ['plugin_id' => $plugin->id]);
    }

    public function test_it_returns_plugin_versions(): void
    {
        $shop = Shop::create([
            'name' => 'Beta',
            'domain' => 'beta.cz',
            'default_locale' => 'cs_CZ',
            'timezone' => 'Europe/Prague',
            'locale' => 'cs_CZ',
            'api_mode' => 'premium',
            'currency_code' => 'CZK',
        ]);

        $plugin = ShoptetPlugin::create([
            'shop_id' => $shop->id,
            'name' => 'Header Banner',
        ]);

        ShoptetPluginVersion::create([
            'plugin_id' => $plugin->id,
            'version' => 1,
            'filename' => 'header-v1.js',
            'summary' => 'Initial version',
            'description' => 'Adds banner',
            'code' => 'console.log("header v1");',
        ]);
        $response = $this->getJson("/api/shoptet/plugins/{$plugin->id}/versions");

        $response
            ->assertOk()
            ->assertJsonPath('data.0.version', 1)
            ->assertJsonPath('data.0.filename', 'header-v1.js')
            ->assertJsonPath('data.0.summary', 'Initial version');
    }

    public function test_it_downloads_plugin_version_code(): void
    {
        $shop = Shop::create([
            'name' => 'Gamma',
            'domain' => 'gamma.cz',
            'default_locale' => 'cs_CZ',
            'timezone' => 'Europe/Prague',
            'locale' => 'cs_CZ',
            'api_mode' => 'premium',
            'currency_code' => 'CZK',
        ]);

        $plugin = ShoptetPlugin::create([
            'shop_id' => $shop->id,
            'name' => 'Footer Ribbon',
        ]);

        $version = ShoptetPluginVersion::create([
            'plugin_id' => $plugin->id,
            'version' => 1,
            'filename' => 'footer.js',
            'summary' => 'Adds footer ribbon',
            'description' => null,
            'code' => 'console.log("footer");',
        ]);

        $this->getJson("/api/shoptet/plugin-versions/{$version->id}")
            ->assertOk()
            ->assertJsonPath('filename', 'footer.js')
            ->assertJsonPath('plugin.name', 'Footer Ribbon');

        $response = $this->get("/api/shoptet/plugin-versions/{$version->id}/download");

        $response
            ->assertOk()
            ->assertHeader('Content-Disposition', 'attachment; filename="footer.js"')
            ->assertSee('console.log("footer");', false);
    }
}
