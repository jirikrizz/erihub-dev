<?php

namespace Modules\Shoptet\Services;

use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;
use Modules\Shoptet\Contracts\ShoptetClient;
use Modules\Shoptet\Models\Shop;

class WebhookRegistrationService
{
    public function __construct(private readonly ShoptetClient $client)
    {
    }

    public function ensureJobFinishedWebhook(Shop $shop): void
    {
        $this->ensureSignatureKey($shop);

        try {
            $this->registerWebhook($shop, 'job:finished');
        } catch (RequestException $exception) {
            if ($exception->response?->status() === 422) {
                $this->handleExistingWebhook($shop);

                return;
            }

            Log::warning('Unable to register job:finished webhook', [
                'shop_id' => $shop->id,
                'exception' => $exception->getMessage(),
            ]);
        } catch (\Throwable $throwable) {
            Log::warning('Unable to register job:finished webhook', [
                'shop_id' => $shop->id,
                'exception' => $throwable->getMessage(),
            ]);
        }
    }

    private function registerWebhook(Shop $shop, string $event): void
    {
        $baseUrl = rtrim(config('app.url'), '/');
        $url = $baseUrl.'/api/shoptet/webhooks/'.$shop->getRouteKey();

        $this->client->registerWebhooks($shop, [
            [
                'event' => $event,
                'url' => $url,
            ],
        ]);
    }

    public function hasJobFinishedWebhook(Shop $shop): bool
    {
        $this->ensureSignatureKey($shop);
        $existing = $this->fetchWebhooks($shop);

        return $this->findMatchingWebhook($shop, $existing) !== null;
    }

    public function ensureSignatureKey(Shop $shop): void
    {
        if ($shop->webhook_secret) {
            return;
        }

        try {
            $key = $this->client->renewWebhookSignatureKey($shop);
        } catch (RequestException $exception) {
            Log::warning('Unable to renew webhook signature key', [
                'shop_id' => $shop->id,
                'exception' => $exception->getMessage(),
            ]);

            return;
        } catch (\Throwable $throwable) {
            Log::warning('Unable to renew webhook signature key', [
                'shop_id' => $shop->id,
                'exception' => $throwable->getMessage(),
            ]);

            return;
        }

        $shop->forceFill(['webhook_secret' => $key])->save();
    }

    private function handleExistingWebhook(Shop $shop): void
    {
        $existing = $this->fetchWebhooks($shop);
        $current = $this->findMatchingWebhook($shop, $existing);

        if ($current !== null) {
            Log::info('Shoptet webhook already exists', [
                'shop_id' => $shop->id,
            ]);

            return;
        }

        $legacy = $this->findWebhookByEvent($existing, 'job:finished');
        $legacyId = is_array($legacy) ? (string) ($legacy['id'] ?? '') : '';

        if ($legacyId !== '') {
            try {
                $this->client->deleteWebhook($shop, $legacyId);
            } catch (\Throwable $throwable) {
                Log::warning('Unable to delete legacy Shoptet webhook', [
                    'shop_id' => $shop->id,
                    'exception' => $throwable->getMessage(),
                ]);

                return;
            }

            $this->registerWebhook($shop, 'job:finished');
        }
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function fetchWebhooks(Shop $shop): array
    {
        try {
            $response = $this->client->listWebhooks($shop);
        } catch (RequestException $exception) {
            Log::warning('Unable to fetch webhooks from Shoptet', [
                'shop_id' => $shop->id,
                'exception' => $exception->getMessage(),
            ]);

            return [];
        } catch (\Throwable $throwable) {
            Log::warning('Unable to fetch webhooks from Shoptet', [
                'shop_id' => $shop->id,
                'exception' => $throwable->getMessage(),
            ]);

            return [];
        }

        $webhooks = Arr::get($response, 'data.webhooks', Arr::get($response, 'webhooks', []));

        return is_array($webhooks) ? $webhooks : [];
    }

    /**
     * @param array<int, array<string, mixed>> $webhooks
     */
    private function findMatchingWebhook(Shop $shop, array $webhooks): ?array
    {
        $baseUrl = rtrim(config('app.url'), '/');
        $expectedUrl = $baseUrl.'/api/shoptet/webhooks/'.$shop->getRouteKey();

        foreach ($webhooks as $webhook) {
            if (! is_array($webhook)) {
                continue;
            }

            $event = $webhook['event'] ?? null;
            $url = $webhook['url'] ?? null;

            if ($event === 'job:finished' && is_string($url) && strcasecmp($url, $expectedUrl) === 0) {
                return $webhook;
            }
        }

        return null;
    }

    /**
     * @param array<int, array<string, mixed>> $webhooks
     */
    private function findWebhookByEvent(array $webhooks, string $event): ?array
    {
        foreach ($webhooks as $webhook) {
            if (! is_array($webhook)) {
                continue;
            }

            if (($webhook['event'] ?? null) === $event) {
                return $webhook;
            }
        }

        return null;
    }
}
