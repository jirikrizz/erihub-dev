<?php

namespace Modules\Shoptet\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Models\ShoptetPlugin;
use Modules\Shoptet\Models\ShoptetPluginVersion;
use Modules\Shoptet\Services\AiPluginGenerator;
use RuntimeException;
use Illuminate\Validation\ValidationException;

class PluginGeneratorController extends Controller
{
    public function __construct(private readonly AiPluginGenerator $generator)
    {
    }

    public function generate(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'goal' => ['required', 'string', 'max:8000'],
            'shop_id' => ['required', 'integer', 'exists:shops,id'],
            'plugin_type' => ['required', Rule::in(['banner', 'function'])],
            'template_id' => ['nullable', 'integer', 'exists:shoptet_plugin_templates,id'],
            'shoptet_surface' => ['nullable', 'string', 'max:255'],
            'data_sources' => ['nullable', 'string', 'max:2000'],
            'additional_notes' => ['nullable', 'string', 'max:4000'],
            'language' => ['nullable', 'string', 'max:32'],
            'bundle_key' => ['nullable', 'string', 'max:64'],
            'brand_primary_color' => ['nullable', 'string', 'max:32'],
            'brand_secondary_color' => ['nullable', 'string', 'max:32'],
            'brand_font_family' => ['nullable', 'string', 'max:120'],
            'plugin_id' => ['nullable', 'integer', 'exists:shoptet_plugins,id'],
        ]);

        $input = [
            'name' => trim($data['name']),
            'goal' => trim($data['goal']),
            'shop_id' => (int) $data['shop_id'],
            'plugin_id' => $data['plugin_id'] ?? null,
            'plugin_type' => $data['plugin_type'],
            'template_id' => $data['template_id'] ?? null,
            'shoptet_surface' => $this->clean($data['shoptet_surface'] ?? null),
            'data_sources' => $this->clean($data['data_sources'] ?? null),
            'additional_notes' => $this->clean($data['additional_notes'] ?? null),
            'language' => $this->clean($data['language'] ?? null),
            'brand_primary_color' => $this->clean($data['brand_primary_color'] ?? null),
            'brand_secondary_color' => $this->clean($data['brand_secondary_color'] ?? null),
            'brand_font_family' => $this->clean($data['brand_font_family'] ?? null),
            'bundle_key' => $this->clean($data['bundle_key'] ?? null) ?? 'main',
        ];

        try {
            $result = $this->generator->generate($input);
        } catch (RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 422);
        }

        $shop = Shop::findOrFail($input['shop_id']);

        $stored = DB::transaction(function () use ($shop, $input, $result) {
            $plugin = $this->resolvePlugin($input['plugin_id'] ?? null, $shop, $input['name']);

            $nextVersion = (int) ($plugin->versions()->max('version') ?? 0) + 1;

            /** @var ShoptetPluginVersion $version */
            $version = $plugin->versions()->create([
                'version' => $nextVersion,
                'filename' => $result['file']['filename'] ?? 'plugin.js',
                'bundle_key' => $input['bundle_key'] ?? 'main',
                'summary' => $result['summary'] ?? null,
                'description' => $result['file']['description'] ?? null,
                'code' => $result['file']['code'] ?? '',
                'installation_steps' => $result['installation_steps'] ?? [],
                'testing_checklist' => $result['testing_checklist'] ?? [],
                'dependencies' => $result['dependencies'] ?? [],
                'warnings' => $result['warnings'] ?? [],
                'metadata' => [
                    'plugin_type' => $input['plugin_type'],
                    'template_id' => $input['template_id'] ?? null,
                    'language' => $input['language'] ?? null,
                    'brand' => [
                        'primary_color' => $input['brand_primary_color'] ?? null,
                        'secondary_color' => $input['brand_secondary_color'] ?? null,
                        'font_family' => $input['brand_font_family'] ?? null,
                    ],
                ],
            ]);

            return [$plugin, $version];
        });

        [$plugin, $version] = $stored;

        return response()->json(array_merge($result, [
            'plugin_id' => $plugin->id,
            'plugin_name' => $plugin->name,
            'shop_id' => $plugin->shop_id,
            'version' => $version->version,
            'version_id' => $version->id,
            'created_at' => $version->created_at?->toISOString(),
            'metadata' => $version->metadata ?? null,
        ]));
    }

    private function clean(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }

    private function resolvePlugin(?int $pluginId, Shop $shop, string $name): ShoptetPlugin
    {
        $trimmedName = trim($name) !== '' ? trim($name) : 'Plugin';

        if ($pluginId !== null) {
            /** @var ShoptetPlugin $plugin */
            $plugin = ShoptetPlugin::query()->lockForUpdate()->findOrFail($pluginId);
            if ($plugin->shop_id !== $shop->id) {
                throw ValidationException::withMessages([
                    'plugin_id' => 'Vybraný plugin patří jinému e-shopu.',
                ]);
            }

            if ($trimmedName !== '' && $plugin->name !== $trimmedName) {
                $plugin->update(['name' => $trimmedName]);
            }

            return $plugin;
        }

        $existing = ShoptetPlugin::query()
            ->lockForUpdate()
            ->where('shop_id', $shop->id)
            ->where('name', $trimmedName)
            ->first();

        if ($existing) {
            return $existing;
        }

        return ShoptetPlugin::create([
            'shop_id' => $shop->id,
            'name' => $trimmedName,
        ]);
    }
}
