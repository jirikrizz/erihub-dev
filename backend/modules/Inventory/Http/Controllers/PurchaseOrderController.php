<?php

namespace Modules\Inventory\Http\Controllers;

use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Modules\Inventory\Models\InventoryPurchaseOrder;
use Modules\Inventory\Models\InventoryPurchaseOrderItem;
use Modules\Inventory\Services\InventoryPurchaseOrderImporter;
use Modules\Pim\Models\ProductVariant;
use RuntimeException;

class PurchaseOrderController extends Controller
{
    public function __construct(private readonly InventoryPurchaseOrderImporter $importer)
    {
    }

    public function index()
    {
        $orders = InventoryPurchaseOrder::query()
            ->orderByDesc('created_at')
            ->get()
            ->map(function (InventoryPurchaseOrder $order) {
                return [
                    'id' => $order->id,
                    'original_filename' => $order->original_filename,
                    'ordered_at' => optional($order->ordered_at)->toDateString(),
                    'expected_arrival_at' => optional($order->expected_arrival_at)->toDateString(),
                    'arrival_days' => $order->arrival_days,
                    'items_count' => $order->items_count,
                    'variant_codes_count' => $order->variant_codes_count,
                    'total_quantity' => (float) $order->total_quantity,
                    'created_at' => optional($order->created_at)->toIso8601String(),
                ];
            })
            ->all();

        return response()->json($orders);
    }

    public function store(Request $request)
    {
        if (! $request->hasFile('file')) {
            throw ValidationException::withMessages(['file' => 'Vyber prosím soubor ve formátu XLSX.']);
        }

        $data = $request->validate([
            'file' => ['required', 'file', 'mimes:xlsx,xls'],
            'ordered_at' => ['required', 'date'],
            'arrival_in_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'expected_arrival_at' => ['nullable', 'date', 'after_or_equal:ordered_at'],
        ]);

        $orderedAt = CarbonImmutable::parse($data['ordered_at'])->startOfDay();
        $arrivalDays = array_key_exists('arrival_in_days', $data) ? $data['arrival_in_days'] : null;
        $expectedArrivalAt = $data['expected_arrival_at'] ?? null;

        if ($expectedArrivalAt) {
            $expectedArrivalAt = CarbonImmutable::parse($expectedArrivalAt)->startOfDay();
        } elseif ($arrivalDays !== null) {
            $expectedArrivalAt = $orderedAt->addDays((int) $arrivalDays);
        }

        $tempPath = $request->file('file')->getRealPath();
        $items = $this->importer->parse($tempPath);
        $codes = collect($items)->pluck('code')->all();

        $variants = ProductVariant::query()
            ->whereIn('code', $codes)
            ->get()
            ->keyBy('code');

        $path = $request->file('file')->storeAs(
            'inventory/purchase-orders',
            uniqid('order_', true).'.'.$request->file('file')->getClientOriginalExtension(),
            'local'
        );

        $order = DB::transaction(function () use (
            $request,
            $items,
            $variants,
            $path,
            $orderedAt,
            $expectedArrivalAt,
            $arrivalDays
        ) {
            $order = InventoryPurchaseOrder::create([
                'user_id' => $request->user()?->id,
                'original_filename' => $request->file('file')->getClientOriginalName(),
                'storage_path' => $path,
                'ordered_at' => $orderedAt,
                'expected_arrival_at' => $expectedArrivalAt,
                'arrival_days' => $arrivalDays,
                'items_count' => count($items),
                'variant_codes_count' => count($items),
                'total_quantity' => collect($items)->sum('quantity'),
            ]);

            $payload = [];
            foreach ($items as $item) {
                $variant = $variants->get($item['code']);

                $payload[] = [
                    'purchase_order_id' => $order->id,
                    'product_variant_id' => $variant?->id,
                    'variant_code' => $item['code'],
                    'quantity' => $item['quantity'],
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }

            InventoryPurchaseOrderItem::insert($payload);

            return $order->fresh();
        });

        return response()->json([
            'id' => $order->id,
            'original_filename' => $order->original_filename,
            'ordered_at' => optional($order->ordered_at)->toDateString(),
            'expected_arrival_at' => optional($order->expected_arrival_at)->toDateString(),
            'arrival_days' => $order->arrival_days,
            'items_count' => $order->items_count,
            'variant_codes_count' => $order->variant_codes_count,
            'total_quantity' => (float) $order->total_quantity,
            'created_at' => optional($order->created_at)->toIso8601String(),
        ], 201);
    }

    public function destroy(InventoryPurchaseOrder $order)
    {
        if ($order->storage_path) {
            Storage::disk('local')->delete($order->storage_path);
        }

        $order->delete();

        return response()->noContent();
    }
}
