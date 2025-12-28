<?php

namespace Modules\Shoptet\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Carbon;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Services\SnapshotService;

class OrderSyncController extends Controller
{
    public function __construct(private readonly SnapshotService $snapshotService)
    {
    }

    public function import(Request $request, Shop $shop)
    {
        $data = $request->validate([
            'changeTimeFrom' => ['nullable', 'date'],
            'changeTimeTo' => ['nullable', 'date'],
            'createdTimeFrom' => ['nullable', 'date'],
            'createdTimeTo' => ['nullable', 'date'],
            'status' => ['nullable', 'string'],
        ]);

        $now = Carbon::now();

        if (! isset($data['changeTimeTo'])) {
            $data['changeTimeTo'] = $now->copy()->toIso8601String();
        }

        if (! isset($data['changeTimeFrom'])) {
            $data['changeTimeFrom'] = $now->copy()->subDays(30)->startOfDay()->toIso8601String();
        }

        $job = $this->snapshotService->requestOrdersSnapshot($shop, $data);

        return response()->json([
            'message' => 'Synchronizace objednávek byla spuštěna. Data se během chvíle aktualizují.',
            'job_id' => $job->job_id,
            'status' => $job->status,
        ], 202);
    }
}
