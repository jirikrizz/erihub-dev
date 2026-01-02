<?php

namespace Modules\Core\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Modules\Core\Console\Commands\RunJobSchedulesCommand;
use Modules\Core\Http\Requests\StoreJobScheduleRequest;
use Modules\Core\Http\Requests\UpdateJobScheduleRequest;
use Modules\Core\Http\Resources\JobScheduleResource;
use Modules\Core\Models\JobSchedule;
use Modules\Core\Support\JobScheduleCatalog;
use Modules\Customers\Jobs\DispatchCustomerMetricsRecalculationJob;
use Modules\Customers\Jobs\DispatchCustomersBackfillFromOrdersJob;
use Modules\Inventory\Jobs\GenerateInventoryRecommendationsJob;
use Modules\Inventory\Jobs\SyncInventoryStockGuardJob;
use Modules\Shoptet\Jobs\FetchNewOrdersJob;
use Modules\Shoptet\Jobs\ImportMasterProductsJob;
use Modules\Shoptet\Jobs\RefreshOrderStatusesJob;
use Modules\Shoptet\Jobs\RequestCustomersSnapshotJob;
use Modules\WooCommerce\Jobs\SyncWooCommerceOrdersJob;

class JobScheduleController extends Controller
{
    public function index(): JsonResponse
    {
        $schedules = JobSchedule::with('shop')
            ->whereIn('job_type', JobScheduleCatalog::keys())
            ->orderBy('job_type')
            ->get()
            ->keyBy('job_type');

        $jobs = [];

        foreach (JobScheduleCatalog::catalog() as $definition) {
            $schedule = $schedules->get($definition['job_type']);

            $jobs[] = $definition + [
                'schedule' => $schedule
                    ? JobScheduleResource::make($schedule)->toArray(request())
                    : null,
            ];
        }

        return response()->json(['jobs' => $jobs]);
    }

    public function store(StoreJobScheduleRequest $request): JsonResponse
    {
        $data = $request->validated();

        $schedule = JobSchedule::updateOrCreate(
            [
                'job_type' => $data['job_type'],
                'shop_id' => $data['shop_id'] ?? null,
            ],
            $data
        );

        $schedule = $schedule->refresh()->load('shop');

        return (new JobScheduleResource($schedule))
            ->response()
            ->setStatusCode(201);
    }

    public function update(UpdateJobScheduleRequest $request, JobSchedule $schedule): JobScheduleResource
    {
        abort_unless(JobScheduleCatalog::contains($schedule->job_type), 404);

        $schedule->fill($request->validated());
        $schedule->save();

        return new JobScheduleResource($schedule->refresh()->load('shop'));
    }

    public function destroy(JobSchedule $schedule): JsonResponse
    {
        abort_unless(JobScheduleCatalog::contains($schedule->job_type), 404);

        $schedule->delete();

        return response()->json(['status' => 'deleted']);
    }

    public function run(JobSchedule $schedule): JsonResponse
    {
        abort_unless(JobScheduleCatalog::contains($schedule->job_type), 404);

        $schedule->forceFill([
            'last_run_at' => now(),
            'last_run_status' => 'queued',
            'last_run_message' => null,
            'last_run_ended_at' => null,
        ])->save();

        $dispatched = $this->dispatchSchedule($schedule);

        if (! $dispatched) {
            return response()->json([
                'status' => 'skipped',
                'message' => 'Pro tento typ úlohy chybí handler.',
            ], 422);
        }

        return (new JobScheduleResource($schedule->refresh()->load('shop')))
            ->response()
            ->setStatusCode(202);
    }

    private function dispatchSchedule(JobSchedule $schedule): bool
    {
        return match ($schedule->job_type) {
            'orders.fetch_new' => $this->dispatchFetchNewOrders($schedule),
            'orders.refresh_statuses' => $this->dispatchOrderStatusRefresh($schedule),
            'orders.refresh_statuses_deep' => $this->dispatchOrderStatusRefresh($schedule),
            'products.import_master' => $this->dispatchProductImport($schedule),
            'customers.recalculate_metrics' => $this->dispatchCustomerMetrics($schedule),
            'customers.backfill_from_orders' => $this->dispatchCustomerBackfill($schedule),
            'customers.fetch_shoptet' => $this->dispatchCustomerSnapshot($schedule),
            'woocommerce.fetch_orders' => $this->dispatchWooCommerceOrders($schedule),
            'inventory.stock_guard_sync' => $this->dispatchInventoryStockGuard($schedule),
            'inventory.generate_recommendations' => $this->dispatchInventoryRecommendations($schedule),
            default => false,
        };
    }

    private function dispatchFetchNewOrders(JobSchedule $schedule): bool
    {
        FetchNewOrdersJob::dispatch($schedule->id);

        return true;
    }

    private function dispatchOrderStatusRefresh(JobSchedule $schedule): bool
    {
        RefreshOrderStatusesJob::dispatch($schedule->id);

        return true;
    }

    private function dispatchProductImport(JobSchedule $schedule): bool
    {
        ImportMasterProductsJob::dispatch($schedule->id);

        return true;
    }

    private function dispatchCustomerMetrics(JobSchedule $schedule): bool
    {
        DispatchCustomerMetricsRecalculationJob::dispatch($schedule->id);

        return true;
    }

    private function dispatchCustomerBackfill(JobSchedule $schedule): bool
    {
        DispatchCustomersBackfillFromOrdersJob::dispatch($schedule->id);

        return true;
    }

    private function dispatchCustomerSnapshot(JobSchedule $schedule): bool
    {
        RequestCustomersSnapshotJob::dispatch($schedule->id);

        return true;
    }

    private function dispatchWooCommerceOrders(JobSchedule $schedule): bool
    {
        SyncWooCommerceOrdersJob::dispatch($schedule->id);

        return true;
    }

    private function dispatchInventoryStockGuard(JobSchedule $schedule): bool
    {
        SyncInventoryStockGuardJob::dispatch($schedule->id);

        return true;
    }

    private function dispatchInventoryRecommendations(JobSchedule $schedule): bool
    {
        GenerateInventoryRecommendationsJob::dispatch($schedule->id);

        return true;
    }
}
