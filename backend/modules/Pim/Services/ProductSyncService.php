<?php

namespace Modules\Pim\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Arr;
use Modules\Pim\Services\ProductSnapshotImporter;
use Modules\Shoptet\Contracts\ShoptetClient;
use Modules\Shoptet\Models\Shop;

class ProductSyncService
{
    public function __construct(
        private readonly ShoptetClient $client,
        private readonly ProductSnapshotImporter $importer,
    ) {
    }

    /**
     * @return array{last_change_time: string|null, processed: int}
     */
    public function sync(
        Shop $shop,
        CarbonImmutable $from,
        CarbonImmutable $to,
        int $itemsPerPage = 50,
        array $extraQuery = []
    ): array
    {
        $page = 1;
        $lastChangeTime = null;
        $processed = 0;

        do {
            $baseQuery = [
                'changeTimeFrom' => $from->toIso8601String(),
                'changeTimeTo' => $to->toIso8601String(),
                'page' => $page,
                'itemsPerPage' => $itemsPerPage,
            ];

            $response = $this->client->listProducts($shop, array_merge($extraQuery, $baseQuery));

            $products = collect(Arr::get($response, 'data.products', []))
                ->filter(fn ($row) => is_array($row));

            if ($products->isEmpty()) {
                break;
            }

            $products->each(function (array $product) use ($shop, &$processed, &$lastChangeTime) {
                $guid = Arr::get($product, 'guid');
                if (! is_string($guid) || $guid === '') {
                    return;
                }

                try {
                    $detail = $this->client->getProduct($shop, $guid, [
                        'include' => ProductSnapshotImporter::FULL_PRODUCT_INCLUDE,
                    ]);
                } catch (\Throwable $throwable) {
                    $detail = null;
                }

                $payload = Arr::get($detail ?? [], 'data.product', []);
                if (! is_array($payload) || $payload === []) {
                    $payload = Arr::get($detail ?? [], 'data', []);
                }
                if (! is_array($payload) || $payload === []) {
                    $payload = $product;
                }

                $this->importer->import($payload, $shop);
                $processed++;

                $changeTime = Arr::get($payload, 'changeTime') ?? Arr::get($product, 'changeTime');
                if (is_string($changeTime) && $changeTime !== '') {
                    try {
                        $candidate = CarbonImmutable::parse($changeTime);
                        $lastChangeTime = $lastChangeTime
                            ? max($lastChangeTime, $candidate->toIso8601String())
                            : $candidate->toIso8601String();
                    } catch (\Throwable $throwable) {
                        // ignore malformed timestamps
                    }
                }
            });

            $paginator = Arr::get($response, 'data.paginator', []);
            $total = (int) ($paginator['total'] ?? $products->count());
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
            'processed' => $processed,
        ];
    }
}
