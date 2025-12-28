<?php

namespace Modules\Inventory\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Inventory\Models\ProductVariantTag;
use Modules\Pim\Models\ProductVariant;

class VariantTagAssignmentController extends Controller
{
    public function sync(Request $request, ProductVariant $variant)
    {
        $data = $request->validate([
            'tag_ids' => ['array'],
            'tag_ids.*' => ['integer', 'exists:product_variant_tags,id'],
        ]);

        $tagIds = $data['tag_ids'] ?? [];

        $variant->tags()->sync($tagIds);

        $variant->load('tags');

        return response()->json([
            'tags' => $variant->tags,
        ]);
    }
}
