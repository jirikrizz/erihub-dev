<?php

namespace Modules\Inventory\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Modules\Inventory\Services\InventoryRecommendationService;
use Modules\Pim\Models\ProductVariant;

class PublicRecommendationsController extends Controller
{
    public function __construct(
        private readonly InventoryRecommendationService $recommendationService
    ) {
    }

    /**
     * Get product recommendations based on a product variant.
     * 
     * Public endpoint for Shoptet plugin integration.
     * Called from e-shop javascript, returns JSON.
     *
     * @param Request $request
     * @return JsonResponse
     */
    public function products(Request $request): JsonResponse
    {
        try {
            // Get variant ID - could be UUID or integer
            $variantIdParam = $request->query('product_id');
            $limit = (int) $request->query('limit', 8);
            $mode = (string) $request->query('mode', 'product'); // product|fragrance|nonfragrance

            // Validate inputs
            if (!$variantIdParam) {
                return response()->json([
                    'error' => 'Invalid product_id',
                    'recommendations' => [],
                ], 400);
            }

            $limit = max(1, min($limit, 20)); // 1-20 limit

            // Find variant by ID (handles both UUID and integer Eloquent PKs)
            $variant = ProductVariant::query()
                ->where('id', $variantIdParam)
                ->orWhere('code', $variantIdParam)  // Also allow lookup by code
                ->first();

            if (!$variant) {
                return response()->json([
                    'error' => 'Product not found',
                    'recommendations' => [],
                ], 404);
            }

            // Get recommendations based on mode
            $recommendations = match ($mode) {
                'fragrance' => $this->recommendationService->recommendByInspirationType($variant, $limit, 'fragrance'),
                'nonfragrance' => $this->recommendationService->recommendByInspirationType($variant, $limit, 'nonfragrance'),
                default => $this->recommendationService->recommendByInspirationType($variant, $limit, 'product'),
            };

            // Transform recommendations to minimal JSON format for embedding
            $transformed = array_map(function ($rec) {
                return [
                    'id' => $rec['id'] ?? null,
                    'name' => $rec['name'] ?? null,
                    'image' => $rec['image'] ?? null,
                    'price' => $rec['price'] ?? null,
                    'original_price' => $rec['original_price'] ?? null,
                    'url' => $rec['url'] ?? null,
                ];
            }, $recommendations);

            return response()->json([
                'status' => 'success',
                'recommendations' => $transformed,
                'count' => count($transformed),
            ]);
        } catch (\Exception $e) {
            // Log error but don't expose details to public
            \Illuminate\Support\Facades\Log::error('PublicRecommendationsController error', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'error' => 'Failed to load recommendations',
                'recommendations' => [],
            ], 500);
        }
    }
}
