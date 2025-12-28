<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Modules\Core\Services\SettingsService;
use Modules\Customers\Jobs\RecalculateCustomerMetricsJob;
use Modules\Customers\Models\Customer;
use Modules\Customers\Models\CustomerMetric;
use Modules\Orders\Models\Order;
use Modules\Orders\Support\OrderStatusResolver;
use Modules\Shoptet\Models\Shop;
use Tests\TestCase;

class CustomerMetricsRespectMappingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware();
    }

    public function test_customer_metrics_use_completed_status_mapping(): void
    {
        /** @var SettingsService $settings */
        $settings = app(SettingsService::class);
        $settings->setJson('orders_status_mapping', [
            'completed' => ['Completed'],
            'returned' => ['Return'],
            'complaint' => ['Complaint'],
            'cancelled' => ['Cancelled'],
        ]);

        $shop = Shop::create([
            'name' => 'Test Shop',
            'domain' => 'shop.test',
            'locale' => 'cs',
            'currency_code' => 'CZK',
        ]);

        $customer = Customer::create([
            'shop_id' => $shop->id,
            'guid' => (string) Str::uuid(),
            'full_name' => 'Alice Example',
            'email' => 'alice@example.com',
        ]);

        Order::create([
            'shop_id' => $shop->id,
            'code' => 'ORD-001',
            'guid' => (string) Str::uuid(),
            'customer_guid' => $customer->guid,
            'status' => 'Completed',
            'ordered_at' => now()->subDays(5),
            'total_with_vat' => 1200,
            'total_with_vat_base' => 1200,
            'currency_code' => 'CZK',
        ]);

        Order::create([
            'shop_id' => $shop->id,
            'code' => 'ORD-002',
            'guid' => (string) Str::uuid(),
            'customer_guid' => $customer->guid,
            'status' => 'Return',
            'ordered_at' => now()->subDays(3),
            'total_with_vat' => 800,
            'total_with_vat_base' => 800,
            'currency_code' => 'CZK',
        ]);

        Order::create([
            'shop_id' => $shop->id,
            'code' => 'ORD-003',
            'guid' => (string) Str::uuid(),
            'customer_guid' => $customer->guid,
            'status' => 'Cancelled',
            'ordered_at' => now()->subDay(),
            'total_with_vat' => 500,
            'total_with_vat_base' => 500,
            'currency_code' => 'CZK',
        ]);

        $job = new RecalculateCustomerMetricsJob([$customer->guid]);
        $job->handle(app(OrderStatusResolver::class));

        $metric = CustomerMetric::find($customer->guid);

        $this->assertNotNull($metric);
        $this->assertSame(1, $metric->orders_count);
        $this->assertSame(1200.0, $metric->total_spent);
        $this->assertSame(1200.0, $metric->total_spent_base);
        $this->assertSame(1200.0, $metric->average_order_value);
        $this->assertSame(1200.0, $metric->average_order_value_base);
        $this->assertNotNull($metric->first_order_at);
        $this->assertNotNull($metric->last_order_at);
        $this->assertTrue($metric->first_order_at->equalTo($metric->last_order_at));
    }
}
