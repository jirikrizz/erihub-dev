<?php

namespace Modules\Shoptet\Services;

use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Modules\Shoptet\Contracts\ShoptetClient;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Models\ShoptetWebhookJob;

class SnapshotService
{
    public function __construct(
        private readonly ShoptetClient $client,
        private readonly SnapshotPipelineService $pipelines
    ) {
    }

    public function requestProductsSnapshot(Shop $shop, array $params = []): ShoptetWebhookJob
    {
        $defaultIncludes = [
            'images',
            'variantParameters',
            'allCategories',
            'flags',
            'descriptiveParameters',
            'measureUnit',
            'surchargeParameters',
            'setItems',
            'filteringParameters',
            'recyclingFee',
            'consumptionTax',
            'warranty',
            'sortVariants',
            'gifts',
            'alternativeProducts',
            'relatedProducts',
            'relatedVideos',
            'relatedFiles',
            'perStockAmounts',
            'perPricelistPrices',
        ];

        $includes = collect($defaultIncludes);

        if (! empty($params['include'])) {
            $requested = collect(explode(',', (string) $params['include']))
                ->map(fn ($value) => trim($value))
                ->filter();

            $includes = $requested
                ->merge($includes)
                ->unique()
                ->values();
        }

        return $this->requestProductsSnapshotWithIncludes($shop, $params, $includes);
    }

    public function requestOrdersSnapshot(Shop $shop, array $params = []): ShoptetWebhookJob
    {
        $defaultIncludes = [
            'shippingDetails',
        ];

        if (empty($params['include'])) {
            $params['include'] = implode(',', $defaultIncludes);
        } else {
            $requested = collect(explode(',', (string) $params['include']))
                ->map(fn ($value) => trim($value))
                ->filter();

            $params['include'] = $requested
                ->merge($defaultIncludes)
                ->unique()
                ->implode(',');
        }

        return $this->requestSnapshot($shop, '/api/orders/snapshot', $params);
    }

    public function requestCustomersSnapshot(Shop $shop, array $params = []): ShoptetWebhookJob
    {
        return $this->requestSnapshot($shop, '/api/customers/snapshot', $params);
    }

    private function requestSnapshot(Shop $shop, string $endpoint, array $params = []): ShoptetWebhookJob
    {
        $filtered = array_filter($params, fn ($value) => $value !== null && $value !== '');
        $jobId = $this->client->requestSnapshot($shop, $endpoint, $filtered);

        /** @var ShoptetWebhookJob $job */
        $job = ShoptetWebhookJob::firstOrNew([
            'shop_id' => $shop->id,
            'job_id' => $jobId,
        ]);

        $isNew = ! $job->exists;

        $job->event = 'job:requested';
        $job->status = 'requested';
        $job->endpoint = $endpoint;
        $job->meta = array_merge($job->meta ?? [], [
            'requested_at' => now()->toIso8601String(),
            'params' => $filtered,
        ]);

        if (! $job->payload) {
            $job->payload = ['type' => 'snapshot_request', 'params' => $filtered];
        }

        $job->save();

        if ($isNew || empty(($job->meta ?? [])['pipeline_id'])) {
            $execution = $this->pipelines->start(
                $shop,
                $endpoint,
                ['params' => $filtered, 'job_id' => $jobId],
                now()->toIso8601String(),
                [
                    'status' => 'queued',
                    'started_at' => null,
                ]
            );

            $job->meta = array_merge($job->meta ?? [], [
                'pipeline_id' => $execution->id,
            ]);
            $job->save();
        }

        return $job;
    }

    private function requestProductsSnapshotWithIncludes(Shop $shop, array $params, Collection $includes): ShoptetWebhookJob
    {
        $paramsWithIncludes = $params;
        $paramsWithIncludes['include'] = $includes->implode(',');

        try {
            return $this->requestSnapshot($shop, '/api/products/snapshot', $paramsWithIncludes);
        } catch (RequestException $exception) {
            $response = $exception->response;

            if (! $response || $response->status() !== 403) {
                throw $exception;
            }

            $reducedIncludes = $this->filterUnsupportedIncludes($includes, $response->json());

            if ($reducedIncludes->count() === $includes->count()) {
                throw $exception;
            }

            Log::warning('Retrying Shoptet product snapshot without unsupported includes.', [
                'shop_id' => $shop->id,
                'removed_includes' => array_values(array_diff($includes->all(), $reducedIncludes->all())),
            ]);

            return $this->requestProductsSnapshotWithIncludes($shop, $params, $reducedIncludes);
        }
    }

    private function filterUnsupportedIncludes(Collection $includes, ?array $response): Collection
    {
        if (! $response) {
            return $includes;
        }

        $messages = collect($response['errors'] ?? [])
            ->map(fn ($error) => (string) ($error['message'] ?? ''))
            ->filter();

        if ($messages->isEmpty()) {
            return $includes;
        }

        $unsupported = $includes->filter(function (string $include) use ($messages) {
            return $messages->contains(function (string $message) use ($include) {
                $needle = strtolower($include.' include');

                return str_contains(strtolower($message), $needle)
                    || str_contains(strtolower($message), strtolower($include.' module'));
            });
        });

        if ($unsupported->isEmpty()) {
            return $includes;
        }

        return $includes->reject(fn ($include) => $unsupported->contains($include))->values();
    }
}
