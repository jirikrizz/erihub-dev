<?php

namespace Modules\Shoptet\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\ValidationException;
use Modules\Shoptet\Jobs\DownloadShoptetSnapshot;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Models\ShoptetWebhookJob;

class WebhookJobController extends Controller
{
    public function index(Request $request, Shop $shop)
    {
        $jobs = ShoptetWebhookJob::query()
            ->where('shop_id', $shop->id)
            ->latest()
            ->paginate($request->integer('per_page', 25));

        return response()->json($jobs);
    }

    public function download(Shop $shop, ShoptetWebhookJob $webhookJob)
    {
        abort_unless($webhookJob->shop_id === $shop->id, 404);

        $allowedStatuses = ['requested', 'waiting_result', 'download_failed', 'downloaded', 'missing_snapshot'];

        if (! in_array($webhookJob->status, $allowedStatuses, true)) {
            throw ValidationException::withMessages([
                'status' => sprintf(
                    'Job ve stavu "%s" nelze stáhnout. Povolené stavy: %s.',
                    $webhookJob->status,
                    implode(', ', $allowedStatuses)
                ),
            ]);
        }

        DownloadShoptetSnapshot::dispatch($webhookJob);

        return response()->json([
            'message' => 'Snapshot se stahuje na pozadí. Stav se aktualizuje po dokončení.',
        ]);
    }
}
