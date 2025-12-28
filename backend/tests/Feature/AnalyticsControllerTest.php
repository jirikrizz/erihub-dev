<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AnalyticsControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware();
    }

    public function test_kpis_endpoint_returns_extended_metrics(): void
    {
        $response = $this->getJson('/api/analytics/kpis');

        $response
            ->assertOk()
            ->assertJsonStructure([
                'products_total',
                'webhooks_downloaded',
                'webhooks_failed',
                'orders_total',
                'orders_total_value',
                'orders_average_value',
                'orders_base_currency',
                'orders_value_by_currency',
                'customers_total',
                'products_sold_total',
                'customers_repeat_ratio',
                'returning_customers_total',
                'repeat_customers_period_total',
                'unique_customers_total',
                'new_customers_total',
                'orders_without_email_total',
                'returning_orders_total',
                'returning_revenue_base',
                'new_orders_total',
                'new_revenue_base',
                'customers_orders_average',
            ]);
    }

    public function test_orders_endpoint_returns_breakdowns(): void
    {
        $response = $this->getJson('/api/analytics/orders');

        $response
            ->assertOk()
            ->assertJsonStructure([
                'totals' => [
                    'orders_count',
                    'orders_value',
                    'orders_average_value',
                    'base_currency',
                ],
                'time_series',
                'top_products',
                'payment_breakdown',
                'shipping_breakdown',
                'status_breakdown',
            ]);
    }
}
