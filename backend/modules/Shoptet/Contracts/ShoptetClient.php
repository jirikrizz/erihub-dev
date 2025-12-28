<?php

namespace Modules\Shoptet\Contracts;

use Modules\Shoptet\Models\Shop;

interface ShoptetClient
{
    public function listProducts(Shop $shop, array $query = []): array;

    public function listOrders(Shop $shop, array $query = []): array;

    public function listCategories(Shop $shop, array $query = []): array;

    public function listFlags(Shop $shop): array;

    public function listFilteringParameters(Shop $shop, array $query = []): array;

    public function listVariantParameters(Shop $shop, array $query = []): array;

    public function getOrder(Shop $shop, string $code, array $query = []): array;

    public function getProduct(Shop $shop, string $guid, array $query = []): array;

    public function updateProduct(Shop $shop, string $guid, array $payload): array;

    public function createProduct(Shop $shop, array $payload): array;

    /**
     * @param array<int, array{code: string, amount: string}> $setItems
     */
    public function setProductSetItems(Shop $shop, string $guid, array $setItems): array;

    public function getCategory(Shop $shop, string $guid): array;

    public function updateCategory(Shop $shop, string $guid, array $payload): array;

    public function refreshAccessToken(Shop $shop): array;

    public function getCategoryProductsPriority(Shop $shop, string $guid, array $query = []): array;

    public function updateCategoryProductsPriority(Shop $shop, string $guid, array $payload): array;

    public function requestSnapshot(Shop $shop, string $endpoint, array $query = []): string;

    public function getJob(Shop $shop, string $jobId): array;

    public function downloadJobResult(Shop $shop, string $url): string;

    public function registerWebhooks(Shop $shop, array $payload): array;

    public function listWebhooks(Shop $shop): array;

    public function renewWebhookSignatureKey(Shop $shop): string;

    public function deleteWebhook(Shop $shop, string $webhookId): void;

    /**
     * @param array<int, array<string, mixed>> $images
     */
    public function createProductImages(Shop $shop, string $guid, string $gallery, array $images): array;

    /**
     * @param array<int, array<string, mixed>> $payload
     */
    public function updatePricelist(Shop $shop, int|string $pricelistId, array $payload): array;

    /**
     * @param array<int, array{productCode: string, amountChange: float|int}> $movements
     */
    public function updateStockMovements(Shop $shop, int|string $stockId, array $movements): array;
}
