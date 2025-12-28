<?php

namespace Modules\Inventory\Services;

use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;
use JsonException;
use SoapClient;
use stdClass;
use Throwable;

class ElogistClient
{
    private ?SoapClient $client = null;

    private ?string $lastError = null;

    private array $config;

    public function __construct(?array $config = null)
    {
        $this->config = $config ?? config('services.elogist', []);
    }

    public function isConfigured(): bool
    {
        return ! empty($this->config['wsdl']) && ! empty($this->config['login']) && ! empty($this->config['password']);
    }

    public function getLastError(): ?string
    {
        return $this->lastError;
    }

    /**
     * @param  array<int, string|null>  $productNumbers
     * @return array<string, float|null>
     */
    public function fetchStockByProductNumbers(array $productNumbers): array
    {
        $numbers = array_values(array_unique(array_filter(array_map(function ($value) {
            if ($value === null) {
                return null;
            }

            $string = trim((string) $value);

            return $string === '' ? null : $string;
        }, $productNumbers))));

        if ($numbers === []) {
            return [];
        }

        $this->lastError = null;

        $client = $this->client();

        if (! $client) {
            $this->lastError = $this->lastError ?? 'Elogist SOAP klient není správně nakonfigurovaný.';

            return [];
        }

        $stock = [];
        $projectId = $this->config['project_id'] ?? null;

        foreach (array_chunk($numbers, 50) as $chunk) {
            $stock = array_merge($stock, $this->fetchChunkWithFallback($client, $chunk, $projectId));
        }

        return $stock;
    }

    private function fetchChunkWithFallback(SoapClient $client, array $chunk, ?string $projectId): array
    {
        if ($chunk === []) {
            return [];
        }

        $request = new stdClass();

        if ($projectId) {
            $request->projectId = $projectId;
        }

        $request->filter = $this->buildFilterPayload($chunk);

        try {
            $response = $client->StockInventoryGet($request);
            $this->throttle();
        } catch (Throwable $exception) {
            if (count($chunk) === 1) {
                $this->lastError = $exception->getMessage();
                Log::error('Elogist StockInventoryGet request failed for product', [
                    'exception' => $exception->getMessage(),
                    'code' => $chunk[0],
                ]);

                return [];
            }

            $half = (int) ceil(count($chunk) / 2);
            $first = array_slice($chunk, 0, $half);
            $second = array_slice($chunk, $half);

            $this->throttle();
            $firstResult = $this->fetchChunkWithFallback($client, $first, $projectId);
            $this->throttle();
            $secondResult = $this->fetchChunkWithFallback($client, $second, $projectId);

            return array_merge($firstResult, $secondResult);
        }

        $stock = [];

        foreach ($this->extractProducts($response) as $item) {
            $productNumber = $this->extractProductNumber($item);
            if (! $productNumber) {
                continue;
            }

            $quantity = $this->extractQuantity($item);
            $stock[$productNumber] = $quantity;
        }

        return $stock;
    }

    private function throttle(): void
    {
        $sleepMs = (int) ($this->config['throttle_sleep_ms'] ?? 0);

        if ($sleepMs > 0) {
            usleep($sleepMs * 1000);
        }
    }

    private function client(): ?SoapClient
    {
        if ($this->client instanceof SoapClient) {
            return $this->client;
        }

        if (! $this->isConfigured()) {
            $this->lastError = 'Chybí přihlašovací údaje pro Elogist API.';

            return null;
        }

        $wsdl = $this->resolveWsdlPath($this->config['wsdl'] ?? null);

        $options = array_filter([
            'login' => $this->config['login'] ?? null,
            'password' => $this->config['password'] ?? null,
            'location' => $this->config['location'] ?? null,
            'soap_version' => defined('SOAP_1_2')
                ? \SOAP_1_2
                : (defined('SOAP_1_1') ? \SOAP_1_1 : null),
            'encoding' => 'UTF-8',
            'trace' => false,
            'exceptions' => true,
            'connection_timeout' => 30,
            'cache_wsdl' => defined('WSDL_CACHE_MEMORY')
                ? \WSDL_CACHE_MEMORY
                : (defined('WSDL_CACHE_NONE') ? \WSDL_CACHE_NONE : null),
        ]);

        try {
            $this->client = new SoapClient($wsdl, $options);
        } catch (Throwable $exception) {
            $this->lastError = $exception->getMessage();
            Log::error('Elogist SOAP client bootstrap failed', [
                'exception' => $exception->getMessage(),
            ]);

            return null;
        }

        return $this->client;
    }

    /**
     * @param  array<int, string>  $numbers
     */
    private function buildFilterPayload(array $numbers): stdClass
    {
        $filter = new stdClass();
        $filter->product = array_map(static function (string $code) {
            $item = new stdClass();
            $item->productId = $code;

            return $item;
        }, $numbers);

        return $filter;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function extractProducts(mixed $response): array
    {
        $normalized = $this->toArray($response);

        $paths = [
            'stockInventory.product',
            'stockInventory.products',
            'stockInventory.stock',
            'product',
            'products',
            'stockInventory',
        ];

        foreach ($paths as $path) {
            $items = Arr::get($normalized, $path);

            if ($items === null) {
                continue;
            }

            if (! is_array($items)) {
                if (is_object($items)) {
                    return [$this->toArray($items)];
                }

                continue;
            }

            if ($items === []) {
                return [];
            }

            return Arr::isAssoc($items) ? [$items] : array_map(function ($item) {
                return is_array($item) ? $item : $this->toArray($item);
            }, $items);
        }

        if (is_array($normalized) && $normalized !== []) {
            return Arr::isAssoc($normalized) ? [$normalized] : $normalized;
        }

        return [];
    }

    private function extractProductNumber(mixed $item): ?string
    {
        $data = is_array($item) ? $item : $this->toArray($item);

        $candidates = [
            Arr::get($data, '@attributes.productId'),
            Arr::get($data, '@attributes.productNumber'),
            Arr::get($data, '@attributes.code'),
            Arr::get($data, 'productSheet.productNumber'),
            Arr::get($data, 'productNumber'),
            Arr::get($data, 'productSheet.productId'),
            Arr::get($data, 'productId'),
            Arr::get($data, 'sku'),
            Arr::get($data, 'code'),
        ];

        foreach ($candidates as $candidate) {
            if ($candidate === null) {
                continue;
            }

            $value = trim((string) $candidate);

            if ($value !== '') {
                return $value;
            }
        }

        return null;
    }

    private function extractQuantity(mixed $item): ?float
    {
        $data = is_array($item) ? $item : $this->toArray($item);

        $candidates = [
            Arr::get($data, 'available'),
            Arr::get($data, 'available._'),
            Arr::get($data, 'stock.available'),
            Arr::get($data, 'stock.available._'),
            Arr::get($data, 'availableQuantity'),
            Arr::get($data, 'quantityAvailable'),
            Arr::get($data, 'stock.availableQuantity'),
            Arr::get($data, 'stock.quantity'),
            Arr::get($data, 'quantity'),
        ];

        foreach ($candidates as $candidate) {
            if ($candidate === null || $candidate === '') {
                continue;
            }

            return is_numeric($candidate) ? (float) $candidate : null;
        }

        return null;
    }

    private function toArray(mixed $value): array
    {
        if (is_array($value)) {
            return $value;
        }

        if (is_object($value)) {
            try {
                $encoded = json_encode($value, JSON_THROW_ON_ERROR);
                $decoded = json_decode($encoded, true, 512, JSON_THROW_ON_ERROR);
            } catch (JsonException $exception) {
                Log::warning('Failed to normalize Elogist payload.', [
                    'exception' => $exception->getMessage(),
                ]);

                return [];
            }

            return is_array($decoded) ? $decoded : [];
        }

        return [];
    }

    private function resolveWsdlPath(?string $wsdl): ?string
    {
        if (! $wsdl) {
            return null;
        }

        $trimmed = trim($wsdl);
        if ($trimmed === '') {
            return null;
        }

        if (str_starts_with($trimmed, 'http://') || str_starts_with($trimmed, 'https://')) {
            return $trimmed;
        }

        if (str_starts_with($trimmed, 'file://')) {
            return $trimmed;
        }

        if (is_file($trimmed)) {
            return $trimmed;
        }

        $basePath = base_path($trimmed);
        if (is_file($basePath)) {
            return $basePath;
        }

        return $trimmed;
    }
}
