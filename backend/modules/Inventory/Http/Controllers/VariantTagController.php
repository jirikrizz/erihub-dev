<?php

namespace Modules\Inventory\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\Rule;
use Modules\Inventory\Models\ProductVariantTag;

class VariantTagController extends Controller
{
    public function index()
    {
        $tags = ProductVariantTag::query()
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $tags]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:product_variant_tags,name'],
            'color' => ['nullable', 'string', 'max:16'],
            'is_hidden' => ['sometimes', 'boolean'],
        ]);

        $data['is_hidden'] = (bool) ($data['is_hidden'] ?? false);

        $tag = ProductVariantTag::create($data);

        return response()->json($tag, 201);
    }

    public function update(Request $request, ProductVariantTag $tag)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('product_variant_tags', 'name')->ignore($tag->id)],
            'color' => ['nullable', 'string', 'max:16'],
            'is_hidden' => ['sometimes', 'boolean'],
        ]);

        if (! array_key_exists('is_hidden', $data)) {
            $data['is_hidden'] = $tag->is_hidden;
        }

        $tag->update($data);

        return response()->json($tag);
    }

    public function destroy(ProductVariantTag $tag)
    {
        $tag->delete();

        return response()->json(['message' => 'Tag odstraněn.']);
    }
}
