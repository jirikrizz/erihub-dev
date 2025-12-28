<?php

namespace Modules\Orders\Support;

use Illuminate\Database\Eloquent\Builder;

class OrderLocationAggregator
{
    public function getTopLocations(
        Builder $ordersQuery,
        Builder $orderItemsQuery,
        int $limit = 8,
        string $orderBy = 'orders'
    ): array {
        $limit = max(1, min($limit, 100));
        $orderBy = in_array($orderBy, ['orders', 'revenue'], true) ? $orderBy : 'orders';

        $postalExpression = $this->postalExpression();
        $cityExpression = $this->cityExpression();
        $regionExpression = $this->regionExpression();

        $topLocationsRows = (clone $ordersQuery)
            ->selectRaw("{$postalExpression} as postal_code")
            ->selectRaw("{$cityExpression} as city")
            ->selectRaw("{$regionExpression} as region")
            ->selectRaw('COUNT(*) as orders_count')
            ->selectRaw('SUM(COALESCE(total_with_vat_base, total_with_vat)) as revenue_base')
            ->groupByRaw("{$postalExpression}, {$cityExpression}, {$regionExpression}")
            ->when(
                $orderBy === 'revenue',
                fn ($query) => $query->orderByDesc('revenue_base')->orderByDesc('orders_count')
            )
            ->when(
                $orderBy === 'orders',
                fn ($query) => $query->orderByDesc('orders_count')->orderByDesc('revenue_base')
            )
            ->limit($limit)
            ->get();

        $locationProductRows = (clone $orderItemsQuery)
            ->whereIn('order_items.item_type', ['product', 'product-set'])
            ->selectRaw("{$postalExpression} as postal_code")
            ->selectRaw("{$cityExpression} as city")
            ->selectRaw('MAX(order_items.name) as product_name')
            ->selectRaw('MAX(order_items.code) as product_code')
            ->selectRaw('SUM(order_items.amount) as quantity')
            ->groupByRaw("{$postalExpression}, {$cityExpression}, order_items.code")
            ->get();

        $locationProductsMap = [];

        foreach ($locationProductRows as $row) {
            $postal = $row->postal_code ?? 'Neznámé PSČ';
            $city = $row->city ?? 'Neznámé město';
            $key = "{$postal}|{$city}";
            $quantity = (float) ($row->quantity ?? 0.0);

            if (! isset($locationProductsMap[$key]) || $quantity > $locationProductsMap[$key]['quantity']) {
                $locationProductsMap[$key] = [
                    'name' => $row->product_name ?? ($row->product_code ? "Produkt {$row->product_code}" : 'Bez názvu'),
                    'code' => $row->product_code,
                    'quantity' => round($quantity, 2),
                ];
            }
        }

        return $topLocationsRows->map(function ($row) use ($locationProductsMap) {
            $postal = $row->postal_code ?? 'Neznámé PSČ';
            $city = $row->city ?? 'Neznámé město';
            $key = "{$postal}|{$city}";
            $topProduct = $locationProductsMap[$key] ?? null;

            return [
                'postal_code' => $postal,
                'city' => $city,
                'region' => ($row->region ?? null) !== '—' ? $row->region : null,
                'orders_count' => (int) ($row->orders_count ?? 0),
                'revenue_base' => round((float) ($row->revenue_base ?? 0.0), 2),
                'top_product' => $topProduct,
            ];
        })->all();
    }

    private function postalExpression(): string
    {
        $delivery = "NULLIF(TRIM(COALESCE(orders.delivery_address->>'postalCode', orders.delivery_address->>'postal_code', orders.delivery_address->>'zip', orders.delivery_address->>'zipCode')), '')";
        $billing = "NULLIF(TRIM(COALESCE(orders.billing_address->>'postalCode', orders.billing_address->>'postal_code', orders.billing_address->>'zip', orders.billing_address->>'zipCode')), '')";

        return "COALESCE({$delivery}, {$billing}, 'Neznámé PSČ')";
    }

    private function cityExpression(): string
    {
        $delivery = "NULLIF(TRIM(COALESCE(orders.delivery_address->>'city', orders.delivery_address->>'town')), '')";
        $billing = "NULLIF(TRIM(COALESCE(orders.billing_address->>'city', orders.billing_address->>'town')), '')";

        return "COALESCE({$delivery}, {$billing}, 'Neznámé město')";
    }

    private function regionExpression(): string
    {
        $delivery = "NULLIF(TRIM(COALESCE(orders.delivery_address->>'state', orders.delivery_address->>'region', orders.delivery_address->>'district')), '')";
        $billing = "NULLIF(TRIM(COALESCE(orders.billing_address->>'state', orders.billing_address->>'region', orders.billing_address->>'district')), '')";

        return "COALESCE({$delivery}, {$billing}, '—')";
    }
}
