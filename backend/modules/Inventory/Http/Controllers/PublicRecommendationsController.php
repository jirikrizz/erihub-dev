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

            // Find variant by ID or code
            // First try by code (since plugin might pass code instead of UUID)
            $variant = ProductVariant::query()
                ->where('code', (string) $variantIdParam)
                ->first();
            
            // If not found by code, try by UUID id
            if (!$variant && strlen($variantIdParam) === 36) {  // UUID length
                $variant = ProductVariant::query()
                    ->where('id', (string) $variantIdParam)
                    ->first();
            }

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

            // Load full product data for URLs and images
            $variantIds = array_column(array_column($recommendations, 'variant'), 'id');
            $variantsWithProducts = ProductVariant::query()
                ->with('product')
                ->whereIn('id', $variantIds)
                ->get()
                ->keyBy('id');

            // Transform recommendations to minimal JSON format for embedding
            $transformed = array_map(function ($rec) use ($variantsWithProducts) {
                $variant = $rec['variant'] ?? [];
                $variantId = $variant['id'] ?? null;
                $fullVariant = $variantId ? $variantsWithProducts->get($variantId) : null;
                $product = $fullVariant?->product;
                $basePayload = $product?->base_payload ?? [];
                
                // Build Shoptet URL
                $productName = $basePayload['name'] ?? null;
                $productGuid = $basePayload['guid'] ?? null;
                $url = null;
                if ($productName && $productGuid) {
                    // Format: https://www.krasnevune.cz/product-name-guid
                    $slug = \Illuminate\Support\Str::slug($productName);
                    $url = "https://www.krasnevune.cz/{$slug}-{$productGuid}";
                }
                
                // Get first image
                $image = null;
                if (isset($basePayload['images'][0])) {
                    $imageData = $basePayload['images'][0];
                    // Shoptet CDN format: https://cdn.myshoptet.com/usr/www.krasnevune.cz/user/shop/big/{cdnName}
                    if (isset($imageData['cdnName'])) {
                        $image = "https://cdn.myshoptet.com/usr/www.krasnevune.cz/user/shop/big/{$imageData['cdnName']}";
                    }
                }
                
                return [
                    'id' => $variant['id'] ?? null,
                    'name' => $variant['name'] ?? null,
                    'image' => $image,
                    'price' => $variant['price'] ?? null,
                    'original_price' => null,
                    'url' => $url,
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
