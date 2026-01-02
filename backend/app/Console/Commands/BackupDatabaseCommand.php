<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;

class BackupDatabaseCommand extends Command
{
    protected $signature = 'db:backup {--retention=30}';
    protected $description = 'Backup the database to storage/backups/';

    public function handle(): int
    {
        $retentionDays = $this->option('retention');
        $backupDir = storage_path('backups');
        
        // Ensure directory exists
        if (!is_dir($backupDir)) {
            mkdir($backupDir, 0755, true);
        }
        
        $filename = "backup-" . now()->format('YmdHis') . ".sql.gz";
        $filepath = $backupDir . '/' . $filename;
        
        $this->info("Starting database backup to {$filepath}...");
        
        try {
            // Use pg_dump for PostgreSQL
            $databaseUrl = config('database.connections.pgsql.url') ?? config('database.connections.pgsql.database');
            $user = config('database.connections.pgsql.username') ?? 'admin_kv';
            $database = config('database.connections.pgsql.database') ?? 'admin_kv';
            
            // Execute dump
            $command = sprintf(
                'pg_dump -U %s %s 2>/dev/null | gzip > %s',
                escapeshellarg($user),
                escapeshellarg($database),
                escapeshellarg($filepath)
            );
            
            $result = Process::run($command);
            
            if ($result->failed()) {
                throw new \Exception("pg_dump failed: " . $result->errorOutput());
            }
            
            // Verify backup
            if (!file_exists($filepath)) {
                throw new \Exception("Backup file not created");
            }
            
            $size = filesize($filepath);
            $this->info("Backup completed: {$filename} (" . $this->formatBytes($size) . ")");
            Log::info("Database backup completed", ['file' => $filename, 'size' => $size]);
            
            // Cleanup old backups
            $this->cleanupOldBackups($backupDir, $retentionDays);
            
            return self::SUCCESS;
        } catch (\Throwable $e) {
            $this->error("Backup failed: " . $e->getMessage());
            Log::error("Database backup failed", ['error' => $e->getMessage()]);
            return self::FAILURE;
        }
    }
    
    private function cleanupOldBackups(string $dir, int $days): void
    {
        $this->info("Cleaning up backups older than {$days} days...");
        
        $files = glob($dir . '/backup-*.sql.gz') ?: [];
        $cutoffTime = now()->subDays($days)->timestamp;
        $deleted = 0;
        
        foreach ($files as $file) {
            if (filemtime($file) < $cutoffTime) {
                unlink($file);
                $deleted++;
            }
        }
        
        $this->info("Deleted {$deleted} old backup files");
    }
    
    private function formatBytes(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $bytes = max($bytes, 0);
        $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
        $pow = min($pow, count($units) - 1);
        $bytes /= (1 << (10 * $pow));
        
        return round($bytes, 2) . ' ' . $units[$pow];
    }
}
