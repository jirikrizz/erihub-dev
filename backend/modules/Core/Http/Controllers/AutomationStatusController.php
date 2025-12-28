<?php

namespace Modules\Core\Http\Controllers;

use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Modules\Core\Models\JobSchedule;
use Modules\Core\Support\JobScheduleCatalog;
use Modules\Shoptet\Models\SnapshotExecution;

class AutomationStatusController extends Controller
{
    private const MONITORED_LOGS = [
        'queue_worker' => 'logs/queue-worker.log',
        'job_schedules' => 'logs/job-schedules.log',
    ];

    private const KNOWN_QUEUES = [
        'snapshots',
        'orders',
        'default',
        'microsites',
        'customers',
        'customers_metrics',
    ];

    public function show(): JsonResponse
    {
        return response()->json([
            'generated_at' => now()->toIso8601String(),
            'queues' => $this->queueStats(),
            'pipelines' => $this->recentPipelines(),
            'job_schedules' => $this->jobSchedules(),
            'logs' => $this->logVitals(),
        ]);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function queueStats(): array
    {
        $pending = DB::table('jobs')
            ->select('queue', DB::raw('count(*) as count'))
            ->groupBy('queue')
            ->pluck('count', 'queue');

        $failed = DB::table('failed_jobs')
            ->select('queue', DB::raw('count(*) as count'))
            ->groupBy('queue')
            ->pluck('count', 'queue');

        $lastFailedAt = DB::table('failed_jobs')
            ->select('queue', DB::raw('MAX(failed_at) as failed_at'))
            ->groupBy('queue')
            ->pluck('failed_at', 'queue');

        $queues = collect(self::KNOWN_QUEUES)
            ->merge($pending->keys())
            ->merge($failed->keys())
            ->unique()
            ->values();

        return $queues
            ->map(function (string $queue) use ($pending, $failed, $lastFailedAt) {
                return [
                    'name' => $queue,
                    'pending' => (int) ($pending[$queue] ?? 0),
                    'failed' => (int) ($failed[$queue] ?? 0),
                    'last_failed_at' => $lastFailedAt[$queue] ?? null,
                ];
            })
            ->sortByDesc('pending')
            ->values()
            ->all();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function recentPipelines(): array
    {
        return SnapshotExecution::query()
            ->with('shop:id,name')
            ->latest('created_at')
            ->limit(10)
            ->get(['id', 'shop_id', 'endpoint', 'status', 'created_at', 'started_at', 'finished_at', 'meta'])
            ->map(function (SnapshotExecution $execution) {
                return [
                    'id' => $execution->id,
                    'shop' => $execution->shop ? [
                        'id' => $execution->shop->id,
                        'name' => $execution->shop->name,
                    ] : null,
                    'endpoint' => $execution->endpoint,
                    'status' => $execution->status,
                    'created_at' => optional($execution->created_at)->toIso8601String(),
                    'started_at' => optional($execution->started_at)->toIso8601String(),
                    'finished_at' => optional($execution->finished_at)->toIso8601String(),
                    'meta' => $execution->meta ?? [],
                ];
            })
            ->all();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function jobSchedules(): array
    {
        $schedules = JobSchedule::query()
            ->with('shop:id,name')
            ->orderBy('job_type')
            ->get();

        return $schedules->map(function (JobSchedule $schedule) {
            $definition = JobScheduleCatalog::contains($schedule->job_type)
                ? JobScheduleCatalog::definition($schedule->job_type)
                : null;

            return [
                'id' => $schedule->id,
                'job_type' => $schedule->job_type,
                'label' => $definition['label'] ?? $schedule->job_type,
                'enabled' => (bool) $schedule->enabled,
                'cron_expression' => $schedule->cron_expression,
                'timezone' => $schedule->timezone,
                'last_run_at' => optional($schedule->last_run_at)->toIso8601String(),
                'last_run_status' => $schedule->last_run_status,
                'last_run_message' => $schedule->last_run_message,
                'last_run_ended_at' => optional($schedule->last_run_ended_at)->toIso8601String(),
                'shop' => $schedule->shop ? [
                    'id' => $schedule->shop->id,
                    'name' => $schedule->shop->name,
                ] : null,
            ];
        })->all();
    }

    /**
     * @return array<string, array<string, mixed>|null>
     */
    private function logVitals(): array
    {
        $vitals = [];

        foreach (self::MONITORED_LOGS as $key => $relativePath) {
            $absolute = storage_path($relativePath);
            if (! is_file($absolute)) {
                $vitals[$key] = null;
                continue;
            }

            $modifiedAt = @filemtime($absolute);
            $size = @filesize($absolute);

            $vitals[$key] = [
                'path' => $relativePath,
                'updated_at' => $modifiedAt ? CarbonImmutable::createFromTimestamp($modifiedAt)->toIso8601String() : null,
                'size' => $size ?: 0,
            ];
        }

        return $vitals;
    }
}
