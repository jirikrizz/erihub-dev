<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const DOMAIN_BUNDLE_MAP = [
        'parfumeshop.hu' => [
            'from' => 'hu-main',
            'to' => 'main',
        ],
        'parfumeshop.ro' => [
            'from' => 'ro-main',
            'to' => 'main',
        ],
        'parfumshop.hr' => [
            'from' => 'hr-main',
            'to' => 'main',
        ],
    ];

    public function up(): void
    {
        $this->remapBundles(self::DOMAIN_BUNDLE_MAP);
    }

    public function down(): void
    {
        $reverse = [];

        foreach (self::DOMAIN_BUNDLE_MAP as $domain => $map) {
            $reverse[$domain] = [
                'from' => $map['to'],
                'to' => $map['from'],
            ];
        }

        $this->remapBundles($reverse);
    }

    /**
     * @param array<string, array{from: string|null, to: string}> $map
     */
    private function remapBundles(array $map): void
    {
        foreach ($map as $domain => $bundles) {
            $pluginIds = DB::table('shoptet_plugins as p')
                ->join('shops as s', 's.id', '=', 'p.shop_id')
                ->where('p.name', 'like', 'Advent%')
                ->where('s.domain', $domain)
                ->pluck('p.id');

            if ($pluginIds->isEmpty()) {
                continue;
            }

            DB::table('shoptet_plugin_versions')
                ->whereIn('plugin_id', $pluginIds)
                ->when(
                    $bundles['from'] !== null,
                    fn ($query) => $query->where('bundle_key', $bundles['from'])
                )
                ->update(['bundle_key' => $bundles['to']]);
        }
    }
};
