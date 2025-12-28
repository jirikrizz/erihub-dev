<?php

namespace Modules\WooCommerce\Services;

use Carbon\Carbon;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;
use Modules\Orders\Services\OrderSnapshotImporter;
use Modules\Shoptet\Models\Shop;
use Modules\WooCommerce\Http\WooCommerceClient;
use Modules\WooCommerce\Models\WooCommerceShop;

class OrderSyncService
{
    public function __construct(
        private readonly WooCommerceClient $client,
        private readonly OrderSnapshotImporter $snapshotImporter
    ) {
    }

    public function sync(Shop $shop, array $options = []): array
    {
        /** @var WooCommerceShop|null $connection */
        $connection = $shop->woocommerce;

        if (! $connection) {
            throw new \RuntimeException('WooCommerce credentials are not configured for this shop.');
        }

        $perPage = min(100, max(1, (int) ($options['per_page'] ?? config('woocommerce.default_per_page', 50))));
        $maxPages = max(1, (int) ($options['max_pages'] ?? config('woocommerce.max_pages', 200)));

        $page = 1;
        $imported = 0;
        $lastOrderId = null;
        $totalPages = 0;

        $filters = $this->buildQueryFilters($options);

        do {
            $query = array_merge($filters, [
                'per_page' => $perPage,
                'page' => $page,
                'orderby' => 'date',
                'order' => 'desc',
            ]);

            $response = $this->client->get($connection, 'orders', $query);

            $orders = $response->json();

            if (! is_array($orders)) {
                break;
            }

            foreach ($orders as $orderPayload) {
                if (! is_array($orderPayload)) {
                    continue;
                }

                $mapped = $this->mapOrderPayload($shop, $orderPayload);
                $this->snapshotImporter->import($mapped, $shop);
                $imported++;
                $lastOrderId = Arr::get($orderPayload, 'id', $lastOrderId);
            }

            $totalPages = (int) ($response->header('X-WP-TotalPages') ?? $page);
            $page++;
        } while ($page <= $totalPages && $page <= $maxPages);

        $connection->forceFill(['last_synced_at' => now()])->save();

        return [
            'imported' => $imported,
            'last_order_id' => $lastOrderId,
            'pages_processed' => max(0, min($page - 1, $totalPages)),
        ];
    }

    private function buildQueryFilters(array $options): array
    {
        $filters = [];

        if (! empty($options['after'])) {
            $filters['after'] = $this->normalizeDate($options['after']);
        }

        if (! empty($options['before'])) {
            $filters['before'] = $this->normalizeDate($options['before']);
        }

        if (! empty($options['status'])) {
            $filters['status'] = $options['status'];
        }

        return $filters;
    }

    private function normalizeDate(mixed $value): ?string
    {
        if (! $value) {
            return null;
        }

        try {
            return Carbon::parse($value)->toIso8601String();
        } catch (\Throwable $throwable) {
            Log::warning('Failed to normalize WooCommerce date filter', [
                'value' => $value,
                'message' => $throwable->getMessage(),
            ]);

            return null;
        }
    }

    /**
     * @return array{order: array<string, mixed>}
     */
    private function mapOrderPayload(Shop $shop, array $order): array
    {
        $orderId = $order['id'] ?? $order['number'] ?? uniqid('wc_', true);
        $code = sprintf('WC-%d-%s', $shop->id, $orderId);
        $currency = $order['currency'] ?? $shop->currency_code ?? 'CZK';

        $total = $this->toFloat($order['total'] ?? null);
        $totalTax = $this->toFloat($order['total_tax'] ?? null);
        $totalWithoutVat = $total !== null && $totalTax !== null ? $total - $totalTax : null;

        $billing = $this->normalizeAddress(Arr::get($order, 'billing', []));
        $shipping = $this->normalizeAddress(Arr::get($order, 'shipping', []));

        $items = [];
        foreach (Arr::get($order, 'line_items', []) as $item) {
            if (! is_array($item)) {
                continue;
            }

            $itemTotal = $this->toFloat($item['total'] ?? null);
            $itemTax = $this->toFloat($item['total_tax'] ?? null);

            $items[] = [
                'itemType' => 'product',
                'name' => $item['name'] ?? 'Produkt',
                'variantName' => Arr::get($item, 'variation'),
                'code' => $item['sku'] ?? null,
                'amount' => $this->toFloat($item['quantity'] ?? null),
                'itemPrice' => [
                    'withVat' => $itemTotal !== null && $itemTax !== null ? $itemTotal + $itemTax : $itemTotal,
                    'withoutVat' => $itemTotal,
                    'vat' => $itemTax,
                    'vatRate' => null,
                ],
                'data' => $item,
            ];
        }

        return [
            'order' => [
                'code' => $code,
                'status' => [
                    'name' => $order['status'] ?? null,
                ],
                'source' => [
                    'name' => 'woocommerce',
                ],
                'creationTime' => $order['date_created_gmt'] ?? $order['date_created'] ?? null,
                'price' => [
                    'currencyCode' => $currency,
                    'withVat' => $total,
                    'withoutVat' => $totalWithoutVat,
                    'vat' => $totalTax,
                ],
                'customer' => [
                    'email' => $billing['email'] ?? $shipping['email'] ?? null,
                    'phone' => $billing['phone'] ?? $shipping['phone'] ?? null,
                    'name' => $billing['fullName'] ?? $shipping['fullName'] ?? null,
                ],
                'billingAddress' => $billing,
                'deliveryAddress' => $shipping,
                'paymentMethod' => [
                    'name' => $order['payment_method_title'] ?? null,
                    'code' => $order['payment_method'] ?? null,
                ],
                'payment' => [
                    'method' => [
                        'name' => $order['payment_method_title'] ?? null,
                        'code' => $order['payment_method'] ?? null,
                    ],
                ],
                'shipping' => [
                    'lines' => Arr::get($order, 'shipping_lines', []),
                    'total' => $this->toFloat($order['shipping_total'] ?? null),
                    'tax' => $this->toFloat($order['shipping_tax'] ?? null),
                ],
                'items' => $items,
                'data' => $order,
            ],
        ];
    }

    private function normalizeAddress(array $address): array
    {
        if ($address === []) {
            return [];
        }

        $firstName = Arr::get($address, 'first_name');
        $lastName = Arr::get($address, 'last_name');
        $fullName = trim(trim((string) $firstName).' '.trim((string) $lastName));

        return array_filter([
            'firstName' => $firstName,
            'lastName' => $lastName,
            'fullName' => $fullName !== '' ? $fullName : null,
            'company' => Arr::get($address, 'company'),
            'street' => trim(((string) Arr::get($address, 'address_1')).' '.((string) Arr::get($address, 'address_2'))),
            'city' => Arr::get($address, 'city'),
            'zip' => Arr::get($address, 'postcode'),
            'country' => Arr::get($address, 'country'),
            'state' => Arr::get($address, 'state'),
            'phone' => Arr::get($address, 'phone'),
            'email' => Arr::get($address, 'email'),
        ], static fn ($value) => $value !== null && $value !== '');
    }

    private function toFloat(mixed $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_numeric($value)) {
            return (float) $value;
        }

        $normalized = str_replace([' ', ','], ['', '.'], (string) $value);

        return is_numeric($normalized) ? (float) $normalized : null;
    }
}
