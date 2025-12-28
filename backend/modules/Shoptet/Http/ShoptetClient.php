<?php

namespace Modules\Shoptet\Http;

use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Arr;
use JsonException;
use Illuminate\Support\Facades\Log;
use Modules\Shoptet\Contracts\ShoptetClient as ShoptetClientContract;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Models\ShopToken;

class ShoptetClient implements ShoptetClientContract
{
    public function __construct(private readonly HttpFactory $http)
    {
    }

    public function listProducts(Shop $shop, array $query = []): array
    {
        return $this->request($shop, 'GET', '/api/products', ['query' => $query]);
    }

    public function listOrders(Shop $shop, array $query = []): array
    {
        return $this->request($shop, 'GET', '/api/orders', ['query' => $query]);
    }

    public function listCategories(Shop $shop, array $query = []): array
    {
        return $this->request($shop, 'GET', '/api/categories', ['query' => $query]);
    }

    public function listFlags(Shop $shop): array
    {
        return $this->request($shop, 'GET', '/api/products/flags');
    }

    public function listFilteringParameters(Shop $shop, array $query = []): array
    {
        $query = ['itemsPerPage' => 200] + $query;

        return $this->fetchPaginatedCollection($shop, '/api/products/filtering-parameters', 'data.filteringParameters', $query);
    }

    public function listVariantParameters(Shop $shop, array $query = []): array
    {
        $query = ['include' => 'values', 'itemsPerPage' => 200] + $query;

        return $this->fetchPaginatedCollection($shop, '/api/products/variant-parameters', 'data.parameters', $query);
    }

    public function getOrder(Shop $shop, string $code, array $query = []): array
    {
        return $this->request($shop, 'GET', "/api/orders/{$code}", ['query' => $query]);
    }

    public function getProduct(Shop $shop, string $guid, array $query = []): array
    {
        $options = $query !== [] ? ['query' => $query] : [];

        return $this->request($shop, 'GET', "/api/products/{$guid}", $options);
    }

    public function updateProduct(Shop $shop, string $guid, array $payload): array
    {
        return $this->request($shop, 'PATCH', "/api/products/{$guid}", ['json' => ['data' => $payload]]);
    }

    public function createProduct(Shop $shop, array $payload): array
    {
        return $this->request($shop, 'POST', '/api/products', ['json' => ['data' => $payload]]);
    }

    public function setProductSetItems(Shop $shop, string $guid, array $setItems): array
    {
        return $this->request($shop, 'PUT', "/api/products/{$guid}/set", [
            'json' => [
                'data' => [
                    'setItems' => array_values($setItems),
                ],
            ],
        ]);
    }

    public function updatePricelist(Shop $shop, int|string $pricelistId, array $payload): array
    {
        $id = (string) $pricelistId;

        return $this->request($shop, 'PATCH', "/api/pricelists/{$id}", ['json' => ['data' => $payload]]);
    }

    public function updateStockMovements(Shop $shop, int|string $stockId, array $movements): array
    {
        $id = (string) $stockId;

        return $this->request($shop, 'PATCH', "/api/stocks/{$id}/movements", [
            'json' => [
                'data' => array_values($movements),
            ],
        ]);
    }

    public function updateCategory(Shop $shop, string $guid, array $payload): array
    {
        return $this->request($shop, 'PATCH', "/api/categories/{$guid}", ['json' => ['data' => $payload]]);
    }

    public function getCategory(Shop $shop, string $guid): array
    {
        return $this->request($shop, 'GET', "/api/categories/{$guid}");
    }

    public function getCategoryProductsPriority(Shop $shop, string $guid, array $query = []): array
    {
        $options = $query !== [] ? ['query' => $query] : [];

        return $this->request($shop, 'GET', "/api/categories/{$guid}/productsPriority", $options);
    }

    public function updateCategoryProductsPriority(Shop $shop, string $guid, array $payload): array
    {
        return $this->request($shop, 'PATCH', "/api/categories/{$guid}/productsPriority", [
            'json' => ['data' => $payload],
        ]);
    }

    public function refreshAccessToken(Shop $shop): array
    {
        /** @var ShopToken|null $token */
        $token = $shop->token;
        if (! $token) {
            throw new \RuntimeException('Shop token not configured.');
        }

        if (! $token->refresh_token) {
            return [
                'access_token' => $token->access_token,
                'refresh_token' => null,
                'expires_in' => null,
            ];
        }

        $response = $this->http->asForm()->post(config('shoptet.oauth_token_url'), [
            'grant_type' => 'refresh_token',
            'refresh_token' => $token->refresh_token,
            'client_id' => config('shoptet.client_id'),
            'client_secret' => config('shoptet.client_secret'),
        ])->throw()->json();

        $token->access_token = $response['access_token'];
        $token->refresh_token = $response['refresh_token'] ?? $token->refresh_token;
        $token->expires_at = now()->addSeconds($response['expires_in'] ?? 3600);
        $token->save();

        return $response;
    }

    public function requestSnapshot(Shop $shop, string $endpoint, array $query = []): string
    {
        $data = $this->request($shop, 'GET', $endpoint, ['query' => $query]);

        $jobId = (string) (
            Arr::get($data, 'jobId')
            ?? Arr::get($data, 'data.jobId')
            ?? Arr::get($data, 'job.jobId')
            ?? Arr::get($data, 'job.id')
            ?? Arr::get($data, 'id')
            ?? ''
        );

        if ($jobId === '') {
            Log::error('Shoptet snapshot response missing jobId.', [
                'shop_id' => $shop->id,
                'endpoint' => $endpoint,
                'response' => $data,
                'query' => $query,
            ]);

            throw new \RuntimeException('Shoptet snapshot request did not return jobId.');
        }

        return $jobId;
    }

    public function getJob(Shop $shop, string $jobId): array
    {
        $data = $this->request($shop, 'GET', "/api/system/jobs/{$jobId}");

        return Arr::get($data, 'job', Arr::get($data, 'data.job', $data));
    }

    public function downloadJobResult(Shop $shop, string $url): string
    {
        $this->ensureValidToken($shop);
        $headers = $this->buildHeaders($shop);
        $timeout = config('shoptet.download_timeout', config('shoptet.timeout'));

        $tempFile = tempnam(sys_get_temp_dir(), 'shoptet_snapshot_');

        $response = $this->http
            ->retry(3, 5000, function ($exception) {
                return $exception instanceof RequestException;
            })
            ->timeout($timeout)
            ->connectTimeout(30)
            ->withHeaders($headers)
            ->withOptions(['sink' => $tempFile])
            ->get($url);

        if ($response->status() === 401 && ($shop->token?->refresh_token)) {
            if ($tempFile && file_exists($tempFile)) {
                @unlink($tempFile);
            }
            $this->refreshAccessToken($shop);

            return $this->downloadJobResult($shop, $url);
        }

        $response->throw();

        return $tempFile;
    }

    public function registerWebhooks(Shop $shop, array $payload): array
    {
        if ($payload === []) {
            return [];
        }

        return $this->request($shop, 'POST', '/api/webhooks', [
            'json' => ['data' => $payload],
        ]);
    }

    public function listWebhooks(Shop $shop): array
    {
        return $this->request($shop, 'GET', '/api/webhooks');
    }

    public function renewWebhookSignatureKey(Shop $shop): string
    {
        $response = $this->request($shop, 'POST', '/api/webhooks/renew-signature-key');

        $key = Arr::get($response, 'data.signatureKey', Arr::get($response, 'signatureKey'));

        if (! is_string($key) || $key === '') {
            throw new \RuntimeException('Unable to obtain Shoptet webhook signature key.');
        }

        return $key;
    }

    public function deleteWebhook(Shop $shop, string $webhookId): void
    {
        $this->request($shop, 'DELETE', "/api/webhooks/{$webhookId}");
    }

    public function createProductImages(Shop $shop, string $guid, string $gallery, array $images): array
    {
        if ($images === []) {
            return [];
        }

        return $this->request($shop, 'POST', "/api/products/{$guid}/images/{$gallery}", [
            'json' => [
                'data' => [
                    'images' => array_values($images),
                ],
            ],
        ]);
    }

    private function fetchPaginatedCollection(Shop $shop, string $endpoint, string $collectionPath, array $query = []): array
    {
        $page = 1;
        $itemsPerPage = (int) ($query['itemsPerPage'] ?? 200);
        $itemsPerPage = $itemsPerPage > 0 ? $itemsPerPage : 200;
        $aggregated = [];
        $lastResponse = null;

        do {
            $response = $this->request($shop, 'GET', $endpoint, [
                'query' => array_merge($query, [
                    'page' => $page,
                    'itemsPerPage' => $itemsPerPage,
                ]),
            ]);

            $lastResponse = $response;

            $chunk = Arr::get($response, $collectionPath, []);
            if (is_array($chunk) && $chunk !== []) {
                $aggregated = array_merge($aggregated, $chunk);
            }

            $pageCount = (int) Arr::get($response, 'data.paginator.pageCount', $page);
            $page++;
        } while ($pageCount >= $page);

        if ($lastResponse === null) {
            $lastResponse = [];
        }

        Arr::set($lastResponse, $collectionPath, $aggregated);
        Arr::set($lastResponse, 'data.paginator.totalCount', count($aggregated));
        Arr::set($lastResponse, 'data.paginator.page', 1);
        Arr::set($lastResponse, 'data.paginator.pageCount', 1);
        Arr::set($lastResponse, 'data.paginator.itemsOnPage', count($aggregated));
        Arr::set($lastResponse, 'data.paginator.itemsPerPage', count($aggregated));

        return $lastResponse;
    }

    private function request(Shop $shop, string $method, string $uri, array $options = []): array
    {
        $token = $this->ensureValidToken($shop);

        $request = $this->http
            ->baseUrl(config('shoptet.base_uri'))
            ->timeout(config('shoptet.timeout'))
            ->withHeaders($this->buildHeaders($shop));

        $retryTimes = config('shoptet.retry.times', 1);
        $retrySleep = config('shoptet.retry.sleep', 0);

        $response = $request->retry($retryTimes, $retrySleep / 1000, function ($exception, $request) {
            if ($exception instanceof RequestException && $exception->response?->status() === 429) {
                return true;
            }

            if ($exception instanceof ConnectionException) {
                return true;
            }

            return false;
        })->send($method, $uri, $options);

        if ($response->status() === 401 && $token->refresh_token) {
            Log::warning('Shoptet token expired, refreshing.', ['shop_id' => $shop->id]);
            $this->refreshAccessToken($shop);

            return $this->request($shop, $method, $uri, $options);
        }

        $response->throw();

        $body = $response->body();

        if ($body === '' || $body === null) {
            return [];
        }

        try {
            $decoded = $response->json();
        } catch (JsonException $exception) {
            Log::debug('Shoptet response is not valid JSON, returning raw body.', [
                'shop_id' => $shop->id,
                'method' => $method,
                'uri' => $uri,
                'body' => $body,
            ]);

            return ['raw' => $body];
        }

        return is_array($decoded) ? $decoded : [];
    }

    private function ensureValidToken(Shop $shop): ShopToken
    {
        /** @var ShopToken|null $token */
        $token = $shop->token;
        if (! $token) {
            throw new \RuntimeException('Shop token not configured.');
        }

        if ($token->expires_at && $token->expires_at->isPast() && $token->refresh_token) {
            $this->refreshAccessToken($shop);
            $token->refresh();
        }

        return $token;
    }

    private function buildHeaders(Shop $shop): array
    {
        $token = $shop->token?->access_token;
        if (! $token) {
            throw new \RuntimeException('Shop token not configured.');
        }

        $mode = $shop->api_mode ?? 'premium';
        $header = in_array($mode, ['premium', 'private'], true)
            ? 'Shoptet-Private-Api-Token'
            : 'Shoptet-Access-Token';

        return [
            $header => $token,
        ];
    }
}
