<?php

namespace Modules\Dashboard\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Dashboard\Support\DashboardSummary;

/**
 * @mixin DashboardSummary
 */
class DashboardSummaryResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @param Request $request
     * @return array<string, mixed>
     */
    public function toArray($request): array
    {
        /** @var DashboardSummary $summary */
        $summary = $this->resource;

        return [
            'range' => [
                'from' => $summary->from->toIso8601String(),
                'to' => $summary->to->toIso8601String(),
                'timezone' => $summary->to->getTimezone()->getName(),
                'selection' => $summary->rangeSelection,
            ],
            'base_currency' => $summary->baseCurrency,
            'totals' => $summary->totals,
            'revenue_by_currency' => $summary->revenueByCurrency,
            'top_shops' => $summary->topShops,
            'top_products' => $summary->topProducts,
            'top_locations' => $summary->topLocations,
            'payment_breakdown' => $summary->paymentMethods,
            'shipping_breakdown' => $summary->shippingMethods,
            'coupon_usage' => $summary->couponUsage,
            'status_breakdown' => $summary->statusBreakdown,
            'sync' => $summary->sync,
            'comparison' => $summary->comparison,
        ];
    }
}
