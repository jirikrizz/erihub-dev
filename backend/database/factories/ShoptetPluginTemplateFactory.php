<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Modules\Shoptet\Models\ShoptetPluginTemplate;

/**
 * @extends Factory<ShoptetPluginTemplate>
 */
class ShoptetPluginTemplateFactory extends Factory
{
    protected $model = ShoptetPluginTemplate::class;

    public function definition(): array
    {
        return [
            'name' => $this->faker->sentence(3),
            'plugin_type' => $this->faker->randomElement(['banner', 'function']),
            'language' => 'cs',
            'description' => $this->faker->sentence(),
            'goal' => $this->faker->paragraph(),
            'shoptet_surface' => 'detail produktu',
            'data_sources' => 'DOM query selectors',
            'additional_notes' => $this->faker->sentence(),
            'brand_primary_color' => '#FF6600',
            'brand_secondary_color' => '#1A1A1A',
            'brand_font_family' => 'Roboto, sans-serif',
            'metadata' => null,
            'is_system' => false,
        ];
    }
}
