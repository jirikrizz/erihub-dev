<?php

namespace Modules\Pim\Services;

use Illuminate\Support\Arr;
use Modules\Shoptet\Contracts\ShoptetClient;
use Modules\Shoptet\Models\Shop;

class CategoryDownloadService
{
    public function __construct(
        private readonly ShoptetClient $client,
        private readonly CategorySyncService $syncService
    ) {
    }

    public function downloadAndSync(Shop $shop): CategorySyncResult
    {
        $page = 1;
        $pageSize = 200;
        $allCategories = [];

        do {
            $response = $this->client->listCategories($shop, [
                'page' => $page,
                'itemsPerPage' => $pageSize,
            ]);

            $payload = Arr::get($response, 'data', $response);

            $categories = Arr::get($payload, 'categories', []);
            if (is_array($categories) && $categories !== []) {
                $allCategories = array_merge($allCategories, $categories);
            }

            $paginator = Arr::get($payload, 'paginator');
            if (! is_array($paginator)) {
                break;
            }

            $currentPage = (int) ($paginator['page'] ?? $page);
            $pageCount = (int) ($paginator['pageCount'] ?? $paginator['pages'] ?? $currentPage);

            $page += 1;
        } while ($currentPage < $pageCount);

        return $this->syncService->syncFromPayload([
            'categories' => $allCategories,
        ], $shop);
    }
}
