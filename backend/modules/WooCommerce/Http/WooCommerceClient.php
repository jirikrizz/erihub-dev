<?php

namespace Modules\WooCommerce\Http;

use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\Client\Response;
use Modules\WooCommerce\Models\WooCommerceShop;

class WooCommerceClient
{
    public function __construct(private readonly HttpFactory $http)
    {
    }

    public function get(WooCommerceShop $connection, string $endpoint, array $query = []): Response
    {
        $url = $this->buildUrl($connection, $endpoint);

        return $this->http
            ->withBasicAuth($connection->consumer_key, $connection->consumer_secret)
            ->acceptJson()
            ->get($url, $query)
            ->throw();
    }

    private function buildUrl(WooCommerceShop $connection, string $endpoint): string
    {
        $baseUrl = $connection->sanitized_base_url;
        $apiVersion = trim($connection->api_version ?? config('woocommerce.api_version', 'wc/v3'), '/');
        $normalizedEndpoint = ltrim($endpoint, '/');

        return sprintf(
            '%s/wp-json/%s/%s',
            $baseUrl,
            $apiVersion,
            $normalizedEndpoint
        );
    }
}
