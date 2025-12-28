<?php

namespace Modules\Shoptet\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\Rule;
use Modules\Shoptet\Models\ShoptetPluginTemplate;

class PluginTemplateController extends Controller
{
    public function index(Request $request)
    {
        $templates = ShoptetPluginTemplate::query()
            ->orderBy('is_system', 'desc')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $templates,
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validatedData($request);

        $template = ShoptetPluginTemplate::create($data);

        return response()->json($template, 201);
    }

    public function show(int $templateId)
    {
        $template = ShoptetPluginTemplate::findOrFail($templateId);

        return response()->json($template);
    }

    public function update(Request $request, int $templateId)
    {
        $template = ShoptetPluginTemplate::findOrFail($templateId);

        if ($template->is_system) {
            return response()->json(['message' => 'Systémovou šablonu nelze upravit.'], 403);
        }

        $data = $this->validatedData($request);

        $template->update($data);

        return response()->json($template);
    }

    public function destroy(int $templateId)
    {
        $template = ShoptetPluginTemplate::findOrFail($templateId);

        if ($template->is_system) {
            return response()->json(['message' => 'Systémovou šablonu nelze odstranit.'], 403);
        }

        $template->delete();

        return response()->json(['message' => 'Šablona odstraněna.']);
    }

    private function validatedData(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'plugin_type' => ['required', Rule::in(['banner', 'function'])],
            'language' => ['nullable', 'string', 'max:32'],
            'description' => ['nullable', 'string', 'max:255'],
            'goal' => ['required', 'string', 'max:8000'],
            'shoptet_surface' => ['nullable', 'string', 'max:255'],
            'data_sources' => ['nullable', 'string', 'max:2000'],
            'additional_notes' => ['nullable', 'string', 'max:4000'],
            'brand_primary_color' => ['nullable', 'string', 'max:32'],
            'brand_secondary_color' => ['nullable', 'string', 'max:32'],
            'brand_font_family' => ['nullable', 'string', 'max:120'],
            'metadata' => ['nullable', 'array'],
        ]);
    }
}
