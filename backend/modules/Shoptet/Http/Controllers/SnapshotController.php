<?php

namespace Modules\Shoptet\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Services\SnapshotService;

class SnapshotController extends Controller
{
    public function __construct(private readonly SnapshotService $service)
    {
    }

    public function products(Request $request, Shop $shop)
    {
        $job = $this->service->requestProductsSnapshot($shop, $request->all());

        return response()->json([
            'job_id' => $job->job_id,
            'status' => $job->status,
            'endpoint' => $job->endpoint,
        ], 202);
    }

    public function orders(Request $request, Shop $shop)
    {
        $job = $this->service->requestOrdersSnapshot($shop, $request->all());

        return response()->json([
            'job_id' => $job->job_id,
            'status' => $job->status,
            'endpoint' => $job->endpoint,
        ], 202);
    }

    public function customers(Request $request, Shop $shop)
    {
        $job = $this->service->requestCustomersSnapshot($shop, $request->all());

        return response()->json([
            'job_id' => $job->job_id,
            'status' => $job->status,
            'endpoint' => $job->endpoint,
        ], 202);
    }
}
