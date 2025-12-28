<?php

namespace Modules\Shoptet\Services;

use Illuminate\Support\Arr;
use Modules\Shoptet\Models\ShopSyncCursor;

class ShopSyncCursorService
{
    public function get(int $shopId, string $key, ?string $default = null): ?string
    {
        /** @var ShopSyncCursor|null $cursor */
        $cursor = ShopSyncCursor::query()
            ->where('shop_id', $shopId)
            ->where('key', $key)
            ->first();

        return $cursor?->cursor ?? $default;
    }

    public function put(int $shopId, string $key, ?string $cursor, array $meta = []): ShopSyncCursor
    {
        /** @var ShopSyncCursor $model */
        $model = ShopSyncCursor::query()->updateOrCreate(
            ['shop_id' => $shopId, 'key' => $key],
            ['cursor' => $cursor, 'meta' => $meta === [] ? null : $meta],
        );

        return $model;
    }

    public function touchMeta(int $shopId, string $key, array $meta): void
    {
        if ($meta === []) {
            return;
        }

        ShopSyncCursor::query()
            ->where('shop_id', $shopId)
            ->where('key', $key)
            ->get()
            ->each(function (ShopSyncCursor $cursor) use ($meta) {
                $cursor->meta = array_replace_recursive($cursor->meta ?? [], $meta);
                $cursor->save();
            });
    }
}
