<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Modules\Shoptet\Models\ShoptetPluginTemplate;

class ShoptetPluginTemplateSeeder extends Seeder
{
    public function run(): void
    {
        $templates = [
            [
                'name' => 'Doprava zdarma - banner',
                'description' => 'Zvýrazní informaci o dopravě zdarma s odpočtem.',
                'plugin_type' => 'banner',
                'language' => 'cs',
                'goal' => 'Zobraz responzivní banner s odpočtem do konce dopravy zdarma.',
                'shoptet_surface' => 'detail produktu, homepage',
                'data_sources' => 'Vyber si #footer nebo .product-detail jako výchozí cíle.',
                'additional_notes' => 'Použij brand barvy, CTA tlačítko a plynulé animace.',
                'brand_primary_color' => '#FF6600',
                'brand_secondary_color' => '#1A1A1A',
                'brand_font_family' => 'Roboto, sans-serif',
                'metadata' => ['tags' => ['shipping', 'promo']],
                'is_system' => true,
            ],
            [
                'name' => 'Upsell příslušenství',
                'description' => 'Přidá doporučení doplňků na detailu produktu.',
                'plugin_type' => 'banner',
                'language' => 'cs',
                'goal' => 'Vlož widget s doporučenými doplňky k aktuálnímu produktu.',
                'shoptet_surface' => 'detail produktu',
                'data_sources' => 'Použij data-layer produktů nebo element .product-detail__related.',
                'additional_notes' => 'Zobraz max 3 položky s cenou a tlačítkem Přidat.',
                'brand_primary_color' => '#2A7AE4',
                'brand_secondary_color' => '#0B1E3F',
                'brand_font_family' => 'Inter, sans-serif',
                'metadata' => ['tags' => ['upsell']],
                'is_system' => true,
            ],
            [
                'name' => 'Ověření formuláře objednávky',
                'description' => 'Hlídá povinná pole a zobrazí upozornění.',
                'plugin_type' => 'function',
                'language' => 'cs',
                'goal' => 'Před odesláním objednávky zkontroluj, zda je vybraný způsob dopravy a platby.',
                'shoptet_surface' => 'checkout',
                'data_sources' => 'Formulář #orderForm, tlačítko .checkout-next.',
                'additional_notes' => 'Použij console.log pro debug a Shoptet notifications pro chyby.',
                'metadata' => ['tags' => ['validation']],
                'is_system' => true,
            ],
        ];

        foreach ($templates as $template) {
            ShoptetPluginTemplate::query()->firstOrCreate(
                ['name' => $template['name']],
                $template
            );
        }
    }
}
