<?php

namespace Modules\Orders\Services;

use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;
use Modules\Shoptet\Contracts\ShoptetClient;
use Modules\Shoptet\Models\Shop;

class OrderImporter
{
    private const DETAIL_INCLUDE = 'shippingDetails';


    public function __construct(
        private readonly ShoptetClient $client,
        private readonly OrderSnapshotImporter $snapshotImporter,
    ) {
    }

    public function import(Shop $shop, array $query = []): array
    {
        $baseQuery = $this->prepareQuery($query);
        $page = 1;

        $totalImported = 0;
        $latestPaginator = null;
        $seenPages = 0;

        do {
            $result = $this->importPage($shop, $baseQuery, $page);

            $totalImported += $result['count'];
            $latestPaginator = $result['paginator'];

            $page = $result['next_page'] ?? ($page + 1);
            $seenPages++;

            $hasMore = ($result['next_page'] ?? null) !== null;

            if ($seenPages >= 1000) {
                break;
            }
        } while ($hasMore);

        return [
            'count' => $totalImported,
            'paginator' => $latestPaginator,
        ];
    }

    public function importPage(Shop $shop, array $query, int $page): array
    {
        $baseQuery = $this->prepareQuery($query);
        $currentQuery = array_merge($baseQuery, ['page' => $page]);

        try {
            $result = $this->client->listOrders($shop, $currentQuery);
        } catch (RequestException $exception) {
            $message = $this->resolveErrorMessage($exception->response?->json() ?? []);

            throw new \RuntimeException(
                'Shoptet order sync failed: '.($message ?: $exception->getMessage()),
                previous: $exception
            );
        }

        $orders = Arr::get($result, 'orders', []);

        foreach ($orders as $payload) {
            $this->processOrderPayload($shop, $payload);
        }

        $paginator = Arr::get($result, 'paginator');
        $currentPage = (int) ($paginator['page'] ?? $page);
        $totalPages = $this->resolveTotalPages($paginator, $currentPage, count($orders));

        $nextPage = ($orders !== [] && $currentPage < $totalPages)
            ? $currentPage + 1
            : null;

        return [
            'count' => count($orders),
            'paginator' => $paginator,
            'next_page' => $nextPage,
        ];
    }

    private function prepareQuery(array $query): array
    {
        $allowed = Arr::only($query, [
            'changeTimeFrom',
            'changeTimeTo',
            'createdTimeFrom',
            'createdTimeTo',
            'status',
        ]);

        return array_filter($allowed, fn ($value) => $value !== null && $value !== '');
    }

    private function resolveTotalPages(?array $paginator, int $currentPage, int $itemsCount): int
    {
        if (is_array($paginator)) {
            foreach (['pages', 'pageCount', 'totalPages'] as $key) {
                if (isset($paginator[$key]) && is_numeric($paginator[$key])) {
                    return max($currentPage, (int) $paginator[$key]);
                }
            }

            if (isset($paginator['total'], $paginator['perPage']) && is_numeric($paginator['total']) && is_numeric($paginator['perPage']) && (int) $paginator['perPage'] > 0) {
                $perPage = max(1, (int) $paginator['perPage']);
                $calculated = (int) ceil(((int) $paginator['total']) / $perPage);

                return max($currentPage, $calculated);
            }
        }

        if ($itemsCount === 0) {
            return $currentPage;
        }

        return $currentPage + 1;
    }

    private function resolveErrorMessage(array $response): ?string
    {
        $message = Arr::get($response, 'errors.0.message');

        if ($message) {
            return $message;
        }

        return Arr::get($response, 'error.message');
    }

    private function processOrderPayload(Shop $shop, array $payload): void
    {
        $code = Arr::get($payload, 'code');

        $orderPayload = $payload;

        if ($this->shouldRequestDetail($payload) && is_string($code) && $code !== '') {
            try {
                $detail = $this->client->getOrder($shop, $code, [
                    'include' => self::DETAIL_INCLUDE,
                ]);

                $detailPayload = Arr::get($detail, 'order');

                if (is_array($detailPayload)) {
                    $orderPayload = $detailPayload;
                }
            } catch (RequestException $exception) {
                Log::warning('Failed to fetch Shoptet order detail', [
                    'shop_id' => $shop->id,
                    'code' => $code,
                    'message' => $exception->getMessage(),
                ]);
            }
        }

        $variantIds = $this->snapshotImporter->import(['order' => $orderPayload], $shop);
        $this->snapshotImporter->refreshMetrics($variantIds);
    }

    private function shouldRequestDetail(array $payload): bool
    {
        $items = Arr::get($payload, 'items');

        if (is_array($items) && $items !== []) {
            return false;
        }

        return true;
    }
}
