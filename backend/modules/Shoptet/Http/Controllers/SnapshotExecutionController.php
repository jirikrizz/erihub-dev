<?php

namespace Modules\Shoptet\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Models\SnapshotExecution;

class SnapshotExecutionController extends Controller
{
    public function index(Request $request, Shop $shop)
    {
        $perPage = $request->integer('per_page', 25);
        $perPage = max(1, min(100, $perPage));

        $query = SnapshotExecution::query()
            ->where('shop_id', $shop->id)
            ->orderByDesc('created_at');

        if ($endpoint = $request->query('endpoint')) {
            $query->where('endpoint', $endpoint);
        }

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        return $query->paginate($perPage);
    }
}
