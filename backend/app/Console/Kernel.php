<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    protected function schedule(Schedule $schedule): void
    {
        $schedule
            ->command('job-schedules:run')
            ->everyMinute()
            ->withoutOverlapping()
            ->runInBackground();

        // Database backup - daily at 2:00 AM UTC
        $schedule->command('db:backup --retention=30')
            ->dailyAt('02:00')
            ->name('backup-database')
            ->withoutOverlapping(60)
            ->onFailure(function () {
                \Illuminate\Support\Facades\Log::error('Database backup failed');
            });

        // Retry failed snapshots - every hour
        $schedule->job(new \Modules\Shoptet\Jobs\RetryFailedSnapshotsJob)
            ->hourly()
            ->name('retry-failed-snapshots')
            ->withoutOverlapping(60)
            ->onQueue('snapshots');
    }

    protected function commands(): void
    {
        $this->load(__DIR__.'/Commands');

        require base_path('routes/console.php');
    }
}
