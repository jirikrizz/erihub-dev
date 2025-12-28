<?php

namespace Modules\Shoptet\Services;

use Illuminate\Contracts\Cache\Lock;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Support\Str;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Models\SnapshotExecution;

class SnapshotPipelineService
{
    private const LOCK_TTL_SECONDS = 1800;

    public function __construct(private readonly CacheRepository $cache)
    {
    }

    public function start(
        Shop $shop,
        string $endpoint,
        array $meta = [],
        ?string $requestedAt = null,
        array $overrides = []
    ): SnapshotExecution {
        $defaults = [
            'shop_id' => $shop->id,
            'endpoint' => $endpoint,
            'status' => 'running',
            'requested_at' => $requestedAt,
            'started_at' => now(),
            'meta' => $meta === [] ? null : $meta,
        ];

        if (array_key_exists('meta', $overrides) && is_array($overrides['meta'])) {
            $defaults['meta'] = $defaults['meta'] === null
                ? $overrides['meta']
                : array_replace_recursive($defaults['meta'], $overrides['meta']);
            unset($overrides['meta']);
        }

        return SnapshotExecution::create(array_merge($defaults, $overrides));
    }

    public function update(?SnapshotExecution $execution, array $attributes): ?SnapshotExecution
    {
        if (! $execution) {
            return null;
        }

        if (array_key_exists('meta', $attributes) && is_array($attributes['meta'])) {
            $execution->meta = $this->mergeMeta($execution->meta ?? [], $attributes['meta']);
            unset($attributes['meta']);
        }

        $execution->fill($attributes);
        $execution->save();

        return $execution;
    }

    public function finish(?SnapshotExecution $execution, string $status = 'completed', array $meta = []): ?SnapshotExecution
    {
        if (! $execution) {
            return null;
        }

        $execution->status = $status;
        $execution->finished_at = now();
        $execution->meta = $this->mergeMeta($execution->meta ?? [], $meta);
        $execution->save();

        return $execution;
    }

    public function acquireLock(Shop $shop, string $endpoint): ?Lock
    {
        $lock = $this->cache->lock($this->lockKey($shop->id, $endpoint), self::LOCK_TTL_SECONDS);

        return $lock->get() ? $lock : null;
    }

    public function releaseLock(?Lock $lock): void
    {
        if (! $lock) {
            return;
        }

        try {
            $lock->release();
        } catch (\Throwable $throwable) {
            // Ignore release failures (lock already expired).
        }
    }

    public function find(?string $id): ?SnapshotExecution
    {
        if (! $id) {
            return null;
        }

        return SnapshotExecution::find($id);
    }

    private function lockKey(int $shopId, string $endpoint): string
    {
        $normalized = Str::slug($endpoint, '_');

        return "snapshot_lock:{$shopId}:{$normalized}";
    }

    private function mergeMeta(array $original, array $updates): array
    {
        if ($updates === []) {
            return $original;
        }

        return array_replace_recursive($original, $updates);
    }
}
