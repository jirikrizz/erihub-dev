<?php

namespace Modules\Shoptet\Http\Controllers;

use Illuminate\Routing\Controller;
use Modules\Shoptet\Models\ShoptetPluginVersion;

class PluginVersionController extends Controller
{
    public function show(int $versionId)
    {
        $version = ShoptetPluginVersion::query()
            ->with('plugin.shop')
            ->findOrFail($versionId);

        return response()->json([
            'id' => $version->id,
            'version' => $version->version,
            'filename' => $version->filename,
            'summary' => $version->summary,
            'description' => $version->description,
            'code' => $version->code,
            'installation_steps' => $version->installation_steps ?? [],
            'testing_checklist' => $version->testing_checklist ?? [],
            'dependencies' => $version->dependencies ?? [],
            'warnings' => $version->warnings ?? [],
            'created_at' => optional($version->created_at)->toISOString(),
            'metadata' => $version->metadata ?? [],
            'bundle_key' => $version->bundle_key,
            'plugin' => [
                'id' => $version->plugin->id,
                'name' => $version->plugin->name,
                'shop_id' => $version->plugin->shop_id,
                'shop_name' => $version->plugin->shop?->name ?? $version->plugin->shop?->domain,
            ],
        ]);
    }

    public function download(int $versionId)
    {
        $version = ShoptetPluginVersion::query()->findOrFail($versionId);
        $filename = $version->filename ?: 'plugin.js';

        return response($version->code, 200, [
            'Content-Type' => 'application/javascript; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
        ]);
    }
}
