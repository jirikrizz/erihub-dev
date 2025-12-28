<?php

namespace Modules\Dashboard\Support;

use Carbon\CarbonImmutable;

class DashboardSummary
{
    /**
     * @param array{
     *   orders:int,
     *   revenue_base:float,
     *   average_order_value_base:float,
     *   items_sold:float,
     *   new_customers:int,
     *   active_customers:int,
     *   returning_customers:int,
     *   guest_orders:int,
     *   returning_customers_share:float
     * } $totals
     * @param array<int, array{currency:string, orders_count:int, total_amount:float, total_amount_base:float}> $revenueByCurrency
     * @param array<int, array{shop_id:int|null, shop_name:?string, orders_count:int, revenue_base:float}> $topShops
     * @param array<int, array{shop_id:int|null, shop_name:?string, code:?string, name:string, quantity:float}> $topProducts
     * @param array<int, array{
     *   postal_code:string,
     *   city:string,
     *   region:?string,
     *   orders_count:int,
     *   revenue_base:float,
     *   top_product?: array{name:string, code:?string, quantity:float}|null
     * }> $topLocations
     * @param array<int, array{name:string, orders_count:int}> $paymentMethods
     * @param array<int, array{name:string, orders_count:int}> $shippingMethods
     * @param array<int, array{code:string, name:?string, uses:int}> $couponUsage
     * @param array<int, array{status:string, orders_count:int}> $statusBreakdown
     * @param array{webhooks_total:int, webhooks_processed:int, webhooks_failed:int, failed_jobs:int} $sync
     * @param array{
     *   selection:string,
     *   range: array{from:string, to:string, timezone:string},
     *   totals: array{
     *     orders:int,
     *     revenue_base:float,
     *     average_order_value_base:float,
     *     items_sold:float,
     *     new_customers:int,
     *     active_customers:int,
     *     returning_customers:int,
     *     guest_orders:int,
     *     returning_customers_share:float
     *   },
     *   returning_customers_share:float
     * }|null $comparison
     */
    public function __construct(
        public readonly CarbonImmutable $from,
        public readonly CarbonImmutable $to,
        public readonly string $rangeSelection,
        public readonly string $baseCurrency,
        public readonly array $totals,
        public readonly array $revenueByCurrency,
        public readonly array $topShops,
        public readonly array $topProducts,
        public readonly array $topLocations,
        public readonly array $paymentMethods,
        public readonly array $shippingMethods,
        public readonly array $couponUsage,
        public readonly array $statusBreakdown,
        public readonly array $sync,
        public readonly ?array $comparison,
    ) {
    }
}
