<?php

namespace Modules\Core\Console\Commands;

use Carbon\CarbonImmutable;
use Cron\CronExpression;
use Illuminate\Console\Command;
use Modules\Core\Models\JobSchedule;
use Modules\Customers\Jobs\DispatchCustomerMetricsRecalculationJob;
use Modules\Customers\Jobs\DispatchCustomersBackfillFromOrdersJob;
use Modules\Inventory\Jobs\SyncInventoryStockGuardJob;
use Modules\Inventory\Jobs\GenerateInventoryRecommendationsJob;
use Modules\Shoptet\Jobs\FetchNewOrdersJob;
use Modules\Shoptet\Jobs\RefreshOrderStatusesJob;
use Modules\Shoptet\Jobs\ImportMasterProductsJob;
use Modules\WooCommerce\Jobs\SyncWooCommerceOrdersJob;
use Modules\Shoptet\Jobs\RequestCustomersSnapshotJob;

class RunJobSchedulesCommand extends Command
{
    protected $signature = 'job-schedules:run {--job=}';

    protected $description = 'Vyhodnotí plánované úlohy a spustí ty, které jsou na řadě.';

    public function handle(): int
    {
        $jobFilter = $this->option('job');
        $now = CarbonImmutable::now('UTC');

        $query = JobSchedule::query()
            ->where('enabled', true);

        if ($jobFilter) {
            $query->where('job_type', $jobFilter);
        }

        $count = 0;

        foreach ($query->get() as $schedule) {
            if (! $this->isDue($schedule, $now)) {
                continue;
            }

            if (! $this->dispatchHandler($schedule)) {
                continue;
            }

            $count++;
        }

        $this->info(sprintf('Dispatched %d schedule(s).', $count));

        return self::SUCCESS;
    }

    private function isDue(JobSchedule $schedule, CarbonImmutable $now): bool
    {
        if (empty($schedule->cron_expression)) {
            return false;
        }

        $timezone = $schedule->timezone ?: config('app.timezone', 'UTC');
        $current = $now->setTimezone($timezone);

        $expression = new CronExpression($schedule->cron_expression);

        if (! $expression->isDue($current->toDateTime(), $timezone)) {
            return false;
        }

        if ($schedule->last_run_at) {
            $threshold = $now->subMinute();
            if ($schedule->last_run_at->greaterThanOrEqualTo($threshold)) {
                return false;
            }
        }

        return true;
    }

    private function dispatchHandler(JobSchedule $schedule): bool
    {
        $schedule->forceFill([
            'last_run_at' => now(),
            'last_run_status' => 'queued',
            'last_run_message' => null,
            'last_run_ended_at' => null,
        ])->save();

        return match ($schedule->job_type) {
            'orders.fetch_new' => $this->dispatchFetchNewOrders($schedule),
            'products.import_master' => $this->dispatchProductImport($schedule),
            'customers.recalculate_metrics' => $this->dispatchCustomerMetrics($schedule),
            'customers.backfill_from_orders' => $this->dispatchCustomerBackfill($schedule),
            'customers.fetch_shoptet' => $this->dispatchCustomerSnapshot($schedule),
            'woocommerce.fetch_orders' => $this->dispatchWooCommerceOrders($schedule),
            'inventory.stock_guard_sync' => $this->dispatchInventoryStockGuard($schedule),
            'inventory.generate_recommendations' => $this->dispatchInventoryRecommendations($schedule),
            'orders.refresh_statuses' => $this->dispatchOrderStatusRefresh($schedule),
            default => $this->markUnsupported($schedule),
        };
    }

    private function dispatchFetchNewOrders(JobSchedule $schedule): bool
    {
        FetchNewOrdersJob::dispatch($schedule->id);

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

    private function dispatchOrderStatusRefresh(JobSchedule $schedule): bool
    {
        RefreshOrderStatusesJob::dispatch($schedule->id);

        return true;
    }

    private function markUnsupported(JobSchedule $schedule): bool
    {
        $schedule->forceFill([
            'last_run_status' => 'skipped',
            'last_run_ended_at' => now(),
            'last_run_message' => 'Pro tento typ úlohy chybí handler.',
        ])->save();

        return false;
    }
}
