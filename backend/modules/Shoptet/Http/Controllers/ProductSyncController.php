<?php

namespace Modules\Shoptet\Http\Controllers;

use Carbon\CarbonImmutable;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;
use Modules\Pim\Models\ProductTranslation;
use Modules\Pim\Services\ProductSnapshotImporter;
use Modules\Pim\Services\ProductSyncService;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Services\ProductImporter;
use Modules\Shoptet\Jobs\PushProductTranslation;

class ProductSyncController extends Controller
{
    public function __construct(
        private readonly ProductImporter $importer,
        private readonly ProductSyncService $productSync,
    ) {
    }

    public function import(Request $request, Shop $shop)
    {
        $query = $request->only(['page', 'perPage', 'changeTimeFrom', 'changeTimeTo']);
        $result = $this->importer->import($shop, array_filter($query));

        return response()->json(['data' => $result]);
    }

    public function bootstrap(Request $request, Shop $shop)
    {
        abort_unless($shop->is_master, 404);

        $validated = $request->validate([
            'days' => ['nullable', 'integer', 'min:1', 'max:30'],
            'items_per_page' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $days = $validated['days'] ?? 14;
        $itemsPerPage = $validated['items_per_page'] ?? 100;
        $itemsPerPage = max(1, min($itemsPerPage, 300));

        $timezone = $shop->timezone ?: config('app.timezone', 'UTC');

        $to = CarbonImmutable::now($timezone)->subSeconds(10);
        $cursorService = app(\Modules\Shoptet\Services\ShopSyncCursorService::class);
        $cursorValue = $cursorService->get($shop->id, 'products.creation_time');

        if ($cursorValue) {
            try {
                $from = CarbonImmutable::parse($cursorValue, $timezone)->subMinutes(5);
            } catch (\Throwable $throwable) {
                $from = $to->subDays($days);
            }
        } else {
            $from = $to->subDays($days);
        }

        try {
            $result = $this->productSync->sync(
                $shop,
                $from,
                $to,
                $itemsPerPage,
                [
                    'creationTimeFrom' => $from->toIso8601String(),
                    'creationTimeTo' => $to->toIso8601String(),
                ]
            );
        } catch (RequestException $exception) {
            $response = $exception->response?->json();
            $errorMessage = is_array($response)
                ? ($response['errors'][0]['message'] ?? $response['message'] ?? $exception->getMessage())
                : $exception->getMessage();

            abort(422, 'Shoptet API odmítlo požadavek: ' . $errorMessage);
        } catch (\Throwable $throwable) {
            report($throwable);
            abort(500, 'Manuální import produktů ze Shoptetu selhal.');
        }

        return response()->json([
            'data' => [
                'processed' => $result['processed'],
                'last_change_time' => $result['last_change_time'],
                'last_cursor' => $cursorValue,
                'window' => [
                    'from' => $from->toIso8601String(),
                    'to' => $to->toIso8601String(),
                ],
            ],
        ]);
    }

    public function push(Shop $shop, ProductTranslation $productTranslation)
    {
        $productTranslation->loadMissing(['product', 'shop']);

        $targetShopId = $productTranslation->shop_id ?? $productTranslation->product?->shop_id;
        abort_unless($targetShopId === $shop->id, 404);

        try {
            PushProductTranslation::dispatchSync($productTranslation);
        } catch (RequestException $exception) {
            $message = $this->extractShoptetError($exception);

            return response()->json([
                'message' => $message,
                'hint' => $this->resolveHint($message),
            ], 422);
        } catch (\RuntimeException $exception) {
            $message = $exception->getMessage();

            return response()->json([
                'message' => $message,
                'hint' => $this->resolveHint($message),
            ], 422);
        } catch (\Throwable $throwable) {
            report($throwable);

            return response()->json([
                'message' => 'Odeslání produktu do Shoptetu selhalo. Podrobnosti najdeš v logu fronty.',
            ], 500);
        }

        return response()->json([
            'data' => [
                'status' => $productTranslation->fresh()?->status,
            ],
        ]);
    }

    private function resolveHint(string $message): ?string
    {
        if (Str::contains($message, 'mapování kategorií')) {
            return 'Otevři Produkty → Mapování kategorií a přiřaď k produktu platné kategorie cílového shopu.';
        }

        if (Str::contains($message, 'produkt bez variant')) {
            return 'Vytvoř alespoň jednu variantu produktu ve skladu nebo doplň chybějící data variant.';
        }

        if (Str::contains($message, 'Remote product GUID not resolved')) {
            return 'Produkt zatím není založen v cílovém Shoptetu. Zkus ho nejprve vytvořit (schválit překlad) nebo zkontroluj napojení remote GUID.';
        }

        return null;
    }

    private function extractShoptetError(RequestException $exception): string
    {
        $response = $exception->response?->json();
        if (is_array($response)) {
            $error = $response['errors'][0]['message'] ?? $response['message'] ?? null;
            if ($error) {
                return 'Shoptet API odmítlo požadavek: '.$error;
            }
        }

        return 'Shoptet API odmítlo požadavek: '.$exception->getMessage();
    }
}
