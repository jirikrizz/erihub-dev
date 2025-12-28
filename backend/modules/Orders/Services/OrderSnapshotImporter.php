<?php

namespace Modules\Orders\Services;

use Carbon\Carbon;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use Modules\Core\Services\CurrencyConverter;
use Modules\Customers\Jobs\AttachOrderCustomerJob;
use Modules\Inventory\Services\InventoryMetricsService;
use Modules\Orders\Models\Order;
use Modules\Orders\Models\OrderItem;
use Modules\Pim\Models\ProductVariant;
use Modules\Shoptet\Models\Shop;

class OrderSnapshotImporter
{
    public function __construct(
        private readonly InventoryMetricsService $metricsService,
        private readonly CurrencyConverter $currencyConverter
    )
    {
    }

    public function import(array $payload, Shop $shop): array
    {
        $orderData = $payload['order'] ?? $payload;
        $code = $orderData['code'] ?? null;
        if (! $code) {
            return [];
        }

        $order = Order::firstOrNew([
            'code' => $code,
        ]);

        $order->shop_id = $shop->id;
        $order->guid = $orderData['guid'] ?? $order->guid ?? (string) Str::uuid();

        $incomingCustomerGuid = $this->normalizeCustomerGuid(
            Arr::get($orderData, 'customer.guid')
                ?? Arr::get($orderData, 'customerGuid')
                ?? null
        );

        if ($incomingCustomerGuid !== null) {
            $order->customer_guid = $incomingCustomerGuid;
        } elseif (! $order->exists) {
            // ensure new records store NULL instead of empty strings
            $order->customer_guid = null;
        }
        $order->status = Arr::get($orderData, 'status.name');
        $order->source = Arr::get($orderData, 'source.name');
        $order->customer_name = $this->extractCustomerName($orderData);
        $order->customer_email = $this->extractCustomerEmail($orderData);
        $order->customer_phone = $this->extractCustomerPhone($orderData);
        $order->ordered_at = $this->parseDate($orderData['creationTime'] ?? null, $shop);

        $currencyCode = Arr::get($orderData, 'price.currencyCode')
            ?? $order->currency_code
            ?? $shop->currency_code
            ?? $this->currencyConverter->getBaseCurrency();

        $order->currency_code = $currencyCode;

        $order->total_with_vat = $this->toFloat(Arr::get($orderData, 'price.withVat'));
        $order->total_without_vat = $this->toFloat(Arr::get($orderData, 'price.withoutVat'));
        $order->total_vat = $this->toFloat(Arr::get($orderData, 'price.vat'));
        $order->price = Arr::get($orderData, 'price');
        $order->billing_address = Arr::get($orderData, 'billingAddress');
        $order->delivery_address = Arr::get($orderData, 'deliveryAddress');
        $order->payment = [
            'method' => Arr::get($orderData, 'paymentMethod'),
            'billing' => Arr::get($orderData, 'billingMethod'),
            'onlinePaymentLink' => Arr::get($orderData, 'onlinePaymentLink'),
        ];
        $order->shipping = Arr::get($orderData, 'shipping');
        $order->data = $orderData;

        $order->total_with_vat_base = $this->currencyConverter->convertToBase($order->total_with_vat, $currencyCode);
        $order->total_without_vat_base = $this->currencyConverter->convertToBase($order->total_without_vat, $currencyCode);
        $order->total_vat_base = $this->currencyConverter->convertToBase($order->total_vat, $currencyCode);
        $isNewOrder = ! $order->exists;

        $order->save();

        if ($isNewOrder || $order->wasRecentlyCreated) {
            Shop::query()->whereKey($order->shop_id)->increment('orders_total');
        }

        $items = $orderData['items'] ?? [];

        $this->syncItems($order, $items);

        if ($order->id) {
            AttachOrderCustomerJob::dispatch($order->id);
        }

        return $this->collectVariantIds($shop, $items);
    }

    private function syncItems(Order $order, array $items): void
    {
        $order->items()->delete();

        if ($items === []) {
            return;
        }

        $now = now();
        $rows = [];

        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }

            $rows[] = [
                'id' => (string) Str::uuid(),
                'order_id' => $order->id,
                'product_guid' => $item['productGuid'] ?? null,
                'item_type' => $item['itemType'] ?? null,
                'name' => $item['name'] ?? 'Unknown item',
                'variant_name' => $item['variantName'] ?? null,
                'code' => $item['code'] ?? null,
                'ean' => $item['ean'] ?? null,
                'amount' => $this->toFloat($item['amount'] ?? null),
                'amount_unit' => $item['amountUnit'] ?? null,
                'price_with_vat' => $this->toFloat(Arr::get($item, 'itemPrice.withVat')),
                'price_without_vat' => $this->toFloat(Arr::get($item, 'itemPrice.withoutVat')),
                'vat' => $this->toFloat(Arr::get($item, 'itemPrice.vat')),
                'vat_rate' => $this->toFloat(Arr::get($item, 'itemPrice.vatRate')),
                'data' => $this->encodePayload($item),
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        if ($rows !== []) {
            OrderItem::query()->insert($rows);
        }
    }

    private function toFloat(mixed $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        return (float) $value;
    }

    private function collectVariantIds(Shop $shop, array $items): array
    {
        $codes = collect($items)
            ->pluck('code')
            ->filter()
            ->unique()
            ->values();

        if ($codes->isEmpty()) {
            return [];
        }

        return ProductVariant::query()
            ->whereIn('code', $codes)
            ->whereHas('product', fn ($query) => $query->where('shop_id', $shop->id))
            ->pluck('id')
            ->unique()
            ->values()
            ->all();
    }

    private function normalizeCustomerGuid(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }

    private function parseDate(?string $value, Shop $shop): ?string
    {
        if (! $value) {
            return null;
        }

        try {
            $hasTimezone = (bool) preg_match('/([Zz]|[+-]\d{2}:?\d{2})$/', $value);

            $timezone = $shop->timezone ?? config('app.timezone', 'UTC');

            $date = $hasTimezone
                ? Carbon::parse($value)
                : Carbon::parse($value, $timezone);

            return $date->setTimezone('UTC')->toDateTimeString();
        } catch (\Throwable $throwable) {
            return $value;
        }
    }

    private function extractCustomerName(array $orderData): ?string
    {
        $fullName = Arr::get($orderData, 'billingAddress.fullName')
            ?? Arr::get($orderData, 'deliveryAddress.fullName')
            ?? Arr::get($orderData, 'customer.name');

        if (is_string($fullName)) {
            $fullName = trim($fullName);
        }

        if (! $fullName) {
            $first = Arr::get($orderData, 'billingAddress.firstName')
                ?? Arr::get($orderData, 'deliveryAddress.firstName');
            $last = Arr::get($orderData, 'billingAddress.lastName')
                ?? Arr::get($orderData, 'deliveryAddress.lastName');

            $composed = trim(trim((string) $first).' '.trim((string) $last));
            $fullName = $composed !== '' ? $composed : null;
        }

        return $fullName ?: null;
    }

    private function extractCustomerEmail(array $orderData): ?string
    {
        $candidates = [
            Arr::get($orderData, 'email'),
            Arr::get($orderData, 'customer.email'),
            Arr::get($orderData, 'billingAddress.email'),
            Arr::get($orderData, 'deliveryAddress.email'),
        ];

        foreach ($candidates as $candidate) {
            if (! is_string($candidate)) {
                continue;
            }

            $trimmed = trim($candidate);

            if ($trimmed !== '') {
                return $trimmed;
            }
        }

        return null;
    }

    private function extractCustomerPhone(array $orderData): ?string
    {
        $candidates = [
            Arr::get($orderData, 'phone'),
            Arr::get($orderData, 'customer.phone'),
            Arr::get($orderData, 'billingAddress.phone'),
            Arr::get($orderData, 'deliveryAddress.phone'),
        ];

        foreach ($candidates as $candidate) {
            if (! is_string($candidate) && ! is_numeric($candidate)) {
                continue;
            }

            $trimmed = trim((string) $candidate);

            if ($trimmed !== '') {
                return $trimmed;
            }
        }

        return null;
    }

    public function refreshMetrics(array $variantIds): void
    {
        $this->metricsService->recalculateForVariants($variantIds);
    }

    private function encodePayload(array $payload): string
    {
        $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        if ($encoded === false) {
            return serialize($payload);
        }

        return $encoded;
    }
}
