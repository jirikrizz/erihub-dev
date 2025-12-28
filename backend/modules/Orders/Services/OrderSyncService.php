<?php

namespace Modules\Orders\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Modules\Orders\Services\OrderSnapshotImporter;
use Modules\Shoptet\Contracts\ShoptetClient;
use Modules\Shoptet\Models\Shop;

class OrderSyncService
{
    public function __construct(
        private readonly ShoptetClient $client,
        private readonly OrderSnapshotImporter $importer
    ) {
    }

    /**
     * @return array{
     *     last_change_time: string|null,
     *     variant_ids: array<int, string>,
     *     orders_count: int
     * }
     */
    public function sync(Shop $shop, CarbonImmutable $from, CarbonImmutable $to, int $itemsPerPage = 50): array
    {
        $page = 1;
        $lastChangeTime = null;
        $ordersProcessed = 0;
        $variantIds = collect();

        do {
            $response = $this->client->listOrders($shop, [
                'changeTimeFrom' => $from->toIso8601String(),
                'changeTimeTo' => $to->toIso8601String(),
                'page' => $page,
                'itemsPerPage' => $itemsPerPage,
            ]);

            $orders = collect(Arr::get($response, 'data.orders', []))
                ->filter(fn ($row) => is_array($row));

            $countThisPage = $orders->count();

            if ($countThisPage === 0) {
                break;
            }

            $ordersProcessed += $countThisPage;

            $orders->each(function (array $order) use ($shop, &$variantIds, &$lastChangeTime) {
                $code = (string) Arr::get($order, 'code');

                try {
                    $detail = $code !== '' ? $this->client->getOrder($shop, $code) : null;
                } catch (\Throwable $throwable) {
                    $detail = null;
                }

                $orderPayload = Arr::get($detail ?? [], 'data.order', []);

                if (! is_array($orderPayload) || $orderPayload === []) {
                    $orderPayload = $order;
                }

                $variantIds = $variantIds->merge($this->importer->import(['order' => $orderPayload], $shop));

                $changeTime = Arr::get($orderPayload, 'changeTime') ?? Arr::get($order, 'changeTime');
                if (is_string($changeTime) && $changeTime !== '') {
                    try {
                        $candidate = CarbonImmutable::parse($changeTime);
                        $lastChangeTime = $lastChangeTime
                            ? max($lastChangeTime, $candidate->toIso8601String())
                            : $candidate->toIso8601String();
                    } catch (\Throwable $throwable) {
                        // Ignore malformed timestamps.
                    }
                }
            });

            $paginator = Arr::get($response, 'data.paginator', []);
            $total = (int) ($paginator['total'] ?? $orders->count());
            $perPage = (int) ($paginator['per_page'] ?? $itemsPerPage);
            if ($perPage <= 0) {
                $perPage = $itemsPerPage;
            }

            $pageCount = (int) ($paginator['page_count'] ?? (int) ceil(max($total, 1) / max($perPage, 1)));
            $currentPage = (int) ($paginator['page'] ?? $page);
            if ($currentPage >= $pageCount) {
                break;
            }

            $page = $currentPage + 1;
        } while (true);

        return [
            'last_change_time' => $lastChangeTime,
            'variant_ids' => $variantIds->unique()->values()->all(),
            'orders_count' => $ordersProcessed,
        ];
    }
}
