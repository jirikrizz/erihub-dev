<?php

namespace Modules\Inventory\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Modules\Core\Traits\WithJobLocking;

/**
 * Maintenance job that ensures future quarterly partitions exist.
 * 
 * Runs quarterly (or manually when needed) to create partitions for:
 * - Next 2 quarters (ensures we're always ahead)
 * - Removes partitions older than 2 years (retention policy)
 * 
 * Example: If today is 2026-01-10 (Q1), this creates:
 * - order_items_2026_q2 (2026-04-01 to 2026-07-01)
 * - order_items_2026_q3 (2026-07-01 to 2026-10-01)
 */
class PartitionMaintenanceJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels, WithJobLocking;

    public int $timeout = 600; // 10 minutes
    public int $tries = 1; // Don't retry - partitions should exist

    public function __construct()
    {
        $this->queue = 'default';
    }

    public function handle(): void
    {
        if (!$this->acquireLock()) {
            Log::info('PartitionMaintenanceJob is already running, skipping');
            return;
        }

        try {
            // Create next 2 quarter partitions if they don't exist
            $this->createFuturePartitions();

            // Remove partitions older than 2 years
            $this->removeOldPartitions();

            Log::info('PartitionMaintenanceJob completed successfully');
        } finally {
            $this->releaseLock();
        }
    }

    /**
     * Create partitions for next 2 quarters
     */
    private function createFuturePartitions(): void
    {
        $today = now();
        
        // Find current quarter
        $month = $today->month;
        $year = $today->year;
        
        $currentQuarter = (int) ceil($month / 3);
        $nextQuarters = [];
        
        // Generate next 2 quarters
        for ($i = 1; $i <= 2; $i++) {
            $quarter = $currentQuarter + $i;
            $quarterYear = $year;
            
            // Handle year boundary
            if ($quarter > 4) {
                $quarter -= 4;
                $quarterYear++;
            }
            
            $nextQuarters[] = [$quarterYear, $quarter];
        }
        
        foreach ($nextQuarters as [$qYear, $qQuarter]) {
            // Q1: Jan-Mar (01-03), Q2: Apr-Jun (04-06), Q3: Jul-Sep (07-09), Q4: Oct-Dec (10-12)
            $startMonth = ($qQuarter - 1) * 3 + 1;
            $endMonth = $startMonth + 3;
            $endYear = $qYear;
            
            if ($endMonth > 12) {
                $endMonth -= 12;
                $endYear++;
            }
            
            $partitionName = "order_items_{$qYear}_q{$qQuarter}";
            $fromDate = sprintf('%d-%02d-01', $qYear, $startMonth);
            $toDate = sprintf('%d-%02d-01', $endYear, $endMonth);
            
            // Check if partition already exists
            $exists = DB::selectOne(
                "SELECT 1 FROM pg_class c 
                JOIN pg_namespace n ON c.relnamespace = n.oid 
                WHERE c.relname = ? AND n.nspname = 'public'",
                [$partitionName]
            );
            
            if ($exists) {
                Log::debug("Partition {$partitionName} already exists");
                continue;
            }
            
            try {
                DB::connection('pgsql')->statement(
                    "CREATE TABLE {$partitionName} PARTITION OF order_items
                    FOR VALUES FROM ('{$fromDate}'::timestamp) TO ('{$toDate}'::timestamp)"
                );
                
                Log::info("Created partition: {$partitionName} ({$fromDate} to {$toDate})");
            } catch (\Exception $e) {
                Log::error("Failed to create partition {$partitionName}: {$e->getMessage()}");
            }
        }
    }
    
    /**
     * Remove partitions older than 2 years (retention policy)
     */
    private function removeOldPartitions(): void
    {
        $cutoffDate = now()->subYears(2);
        $cutoffYear = $cutoffDate->year;
        $cutoffQuarter = (int) ceil($cutoffDate->month / 3);
        
        Log::debug("Removing partitions before {$cutoffYear}-Q{$cutoffQuarter}");
        
        // Query all existing partitions
        $partitions = DB::selectOne(
            "SELECT array_agg(inhrelname::text) as partitions 
            FROM pg_inherits 
            JOIN pg_class p ON pg_inherits.inhrelid = p.oid 
            JOIN pg_class c ON pg_inherits.inhparent = c.oid 
            WHERE c.relname = 'order_items'"
        );
        
        if (!$partitions || !$partitions->partitions) {
            return;
        }
        
        // Remove partitions matching pattern order_items_YYYY_qN
        foreach ($partitions->partitions as $partition) {
            if (!preg_match('/order_items_(\d{4})_q(\d)/', $partition, $matches)) {
                continue;
            }
            
            $year = (int) $matches[1];
            $quarter = (int) $matches[2];
            
            // Keep partitions from last 2 years
            if ($year > $cutoffYear || ($year == $cutoffYear && $quarter >= $cutoffQuarter)) {
                continue;
            }
            
            try {
                DB::connection('pgsql')->statement("DROP TABLE IF EXISTS {$partition}");
                Log::info("Removed old partition: {$partition}");
            } catch (\Exception $e) {
                Log::error("Failed to remove partition {$partition}: {$e->getMessage()}");
            }
        }
    }
}
