<?php

namespace Modules\Core\Traits;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

trait WithJobLocking
{
    /**
     * Get the lock key for this job.
     */
    protected function getLockKey(): string
    {
        $class = class_basename(static::class);
        return "job-lock:{$class}";
    }

    /**
     * Get the lock timeout in seconds (default: 1 hour).
     */
    protected function getLockTimeout(): int
    {
        return $this->jobLockTimeout ?? 3600;
    }

    /**
     * Attempt to acquire the job lock before executing.
     * Returns true if lock was acquired, false if another instance is running.
     */
    protected function acquireLock(): bool
    {
        $lock = Cache::lock($this->getLockKey(), $this->getLockTimeout());

        if ($lock->get()) {
            Log::debug('Job lock acquired', [
                'job' => class_basename(static::class),
                'lock_key' => $this->getLockKey(),
            ]);
            return true;
        }

        Log::info('Job is already running, skipping', [
            'job' => class_basename(static::class),
            'lock_key' => $this->getLockKey(),
        ]);
        return false;
    }

    /**
     * Release the job lock.
     */
    protected function releaseLock(): void
    {
        $lock = Cache::lock($this->getLockKey(), $this->getLockTimeout());
        $lock->release();

        Log::debug('Job lock released', [
            'job' => class_basename(static::class),
            'lock_key' => $this->getLockKey(),
        ]);
    }
}
