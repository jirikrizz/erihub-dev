<?php

namespace Modules\Shoptet\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\Rule;
use Modules\Shoptet\Models\ShoptetPlugin;
use Modules\Shoptet\Models\ShoptetPluginVersion;

class PluginController extends Controller
{
    public function index(Request $request)
    {
        $plugins = ShoptetPlugin::query()
            ->with(['shop', 'latestVersion'])
            ->when($request->integer('shop_id'), fn ($query, $shopId) => $query->where('shop_id', $shopId))
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 25));

        $data = $plugins->getCollection()->map(function (ShoptetPlugin $plugin) {
            $latest = $plugin->latestVersion;

            return [
                'id' => $plugin->id,
                'name' => $plugin->name,
                'shop_id' => $plugin->shop_id,
                'shop_name' => $plugin->shop?->name ?? $plugin->shop?->domain,
                'created_at' => optional($plugin->created_at)->toISOString(),
                'latest_version' => $latest?->version,
                'latest_version_id' => $latest?->id,
                'latest_summary' => $latest?->summary,
                'latest_filename' => $latest?->filename,
                'latest_created_at' => optional($latest?->created_at)->toISOString(),
                'latest_metadata' => $latest?->metadata,
                'latest_bundle_key' => $latest?->bundle_key,
            ];
        })->values();

        return response()->json([
            'data' => $data,
            'meta' => [
                'current_page' => $plugins->currentPage(),
                'per_page' => $plugins->perPage(),
                'total' => $plugins->total(),
                'last_page' => $plugins->lastPage(),
            ],
        ]);
    }

    public function show(int $pluginId)
    {
        $plugin = ShoptetPlugin::query()
            ->with(['shop', 'versions' => fn ($query) => $query->orderByDesc('version')])
            ->findOrFail($pluginId);

        return response()->json([
            'id' => $plugin->id,
            'name' => $plugin->name,
            'shop_id' => $plugin->shop_id,
            'shop_name' => $plugin->shop?->name ?? $plugin->shop?->domain,
            'created_at' => optional($plugin->created_at)->toISOString(),
            'versions' => $plugin->versions->map(fn (ShoptetPluginVersion $version) => $this->serializeVersion($version))->all(),
        ]);
    }

    public function versions(int $pluginId)
    {
        $versions = ShoptetPluginVersion::query()
            ->where('plugin_id', $pluginId)
            ->orderByDesc('version')
            ->get();

        $payload = $versions
            ->map(fn (ShoptetPluginVersion $version) => $this->serializeVersion($version))
            ->values()
            ->all();

        return response()->json([
            'data' => $payload,
        ]);
    }

    public function update(Request $request, int $pluginId)
    {
        $plugin = ShoptetPlugin::with('shop')->findOrFail($pluginId);

        $data = $request->validate([
            'name' => [
                'required',
                'string',
                'max:160',
                Rule::unique('shoptet_plugins', 'name')->where(function ($query) use ($plugin) {
                    return $query->where('shop_id', $plugin->shop_id);
                })->ignore($plugin->id),
            ],
        ]);

        $plugin->update($data);

        return response()->json($plugin->fresh('latestVersion'));
    }

    public function destroy(int $pluginId)
    {
        $plugin = ShoptetPlugin::findOrFail($pluginId);

        $plugin->delete();

        return response()->json(['message' => 'Plugin odstraněn.']);
    }

    private function serializeVersion(ShoptetPluginVersion $version): array
    {
        return [
            'id' => $version->id,
            'version' => $version->version,
            'filename' => $version->filename,
            'summary' => $version->summary,
            'description' => $version->description,
            'created_at' => optional($version->created_at)->toISOString(),
            'installation_steps' => $version->installation_steps ?? [],
            'testing_checklist' => $version->testing_checklist ?? [],
            'dependencies' => $version->dependencies ?? [],
            'warnings' => $version->warnings ?? [],
            'metadata' => $version->metadata ?? [],
            'bundle_key' => $version->bundle_key,
        ];
    }
}
