<?php

namespace Modules\Shoptet\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\Paginator;
use Modules\Shoptet\Models\FailedSnapshot;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Jobs\ProcessShoptetSnapshot;

class FailedSnapshotController
{
    public function index(Shop $shop, Request $request): JsonResponse
    {
        $query = FailedSnapshot::where('shop_id', $shop->id);

        if ($request->has('status')) {
            $query->where('status', $request->get('status'));
        }

        $failedSnapshots = $query
            ->with('webhookJob')
            ->latest('created_at')
            ->paginate(15);

        return response()->json([
            'data' => $failedSnapshots->map(fn($fs) => [
                'id' => $fs->id,
                'webhook_job_id' => $fs->webhook_job_id,
                'endpoint' => $fs->endpoint,
                'status' => $fs->status,
                'retry_count' => $fs->retry_count,
                'max_retries' => $fs->max_retries,
                'error_message' => $fs->error_message,
                'first_failed_at' => $fs->first_failed_at?->toIso8601String(),
                'last_failed_at' => $fs->last_failed_at?->toIso8601String(),
                'resolved_at' => $fs->resolved_at?->toIso8601String(),
                'created_at' => $fs->created_at?->toIso8601String(),
            ]),
            'pagination' => [
                'total' => $failedSnapshots->total(),
                'per_page' => $failedSnapshots->perPage(),
                'current_page' => $failedSnapshots->currentPage(),
                'last_page' => $failedSnapshots->lastPage(),
            ],
        ]);
    }

    public function show(Shop $shop, FailedSnapshot $failedSnapshot): JsonResponse
    {
        if ($failedSnapshot->shop_id !== $shop->id) {
            return response()->json(['message' => 'Not found'], 404);
        }

        return response()->json([
            'id' => $failedSnapshot->id,
            'webhook_job_id' => $failedSnapshot->webhook_job_id,
            'endpoint' => $failedSnapshot->endpoint,
            'status' => $failedSnapshot->status,
            'retry_count' => $failedSnapshot->retry_count,
            'max_retries' => $failedSnapshot->max_retries,
            'error_message' => $failedSnapshot->error_message,
            'context' => $failedSnapshot->context,
            'first_failed_at' => $failedSnapshot->first_failed_at?->toIso8601String(),
            'last_failed_at' => $failedSnapshot->last_failed_at?->toIso8601String(),
            'resolved_at' => $failedSnapshot->resolved_at?->toIso8601String(),
            'created_at' => $failedSnapshot->created_at?->toIso8601String(),
            'updated_at' => $failedSnapshot->updated_at?->toIso8601String(),
        ]);
    }

    public function retry(Shop $shop, FailedSnapshot $failedSnapshot): JsonResponse
    {
        if ($failedSnapshot->shop_id !== $shop->id) {
            return response()->json(['message' => 'Not found'], 404);
        }

        if (!$failedSnapshot->canRetry()) {
            return response()->json([
                'message' => 'Cannot retry failed snapshot - max retries exceeded or already resolved',
            ], 422);
        }

        $webhookJob = $failedSnapshot->webhookJob;
        if (!$webhookJob) {
            return response()->json(['message' => 'Associated webhook job not found'], 404);
        }

        $failedSnapshot->markAsRetrying();

        try {
            ProcessShoptetSnapshot::dispatch($webhookJob);

            return response()->json([
                'message' => 'Snapshot retry dispatched successfully',
                'failed_snapshot' => [
                    'id' => $failedSnapshot->id,
                    'status' => $failedSnapshot->status,
                    'retry_count' => $failedSnapshot->retry_count,
                ],
            ]);
        } catch (\Throwable $e) {
            $failedSnapshot->markAsFailed($e->getMessage());

            return response()->json([
                'message' => 'Failed to dispatch snapshot retry',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function destroy(Shop $shop, FailedSnapshot $failedSnapshot): JsonResponse
    {
        if ($failedSnapshot->shop_id !== $shop->id) {
            return response()->json(['message' => 'Not found'], 404);
        }

        $failedSnapshot->delete();

        return response()->json(['message' => 'Failed snapshot record deleted']);
    }
}
