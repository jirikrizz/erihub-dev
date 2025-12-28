<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Core\Models\AppSetting;
use Tests\TestCase;

class AnalyticsSettingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware();
    }

    public function test_it_returns_default_settings(): void
    {
        $response = $this->getJson('/api/settings/analytics');

        $response->assertOk()->assertJson([
            'default_range' => 'last_30_days',
            'compare_enabled' => true,
            'visible_metrics' => [
                'orders_total',
                'orders_total_value',
                'orders_average_value',
                'customers_total',
            ],
            'rfm_thresholds' => [
                'recency' => [30, 60, 90],
                'frequency' => [1, 3, 5],
                'monetary' => [1000, 3000, 7000],
            ],
        ]);
    }

    public function test_it_stores_settings(): void
    {
        $payload = [
            'default_range' => 'month_to_date',
            'compare_enabled' => false,
            'visible_metrics' => ['orders_total'],
            'rfm_thresholds' => [
                'recency' => [10, 20],
                'frequency' => [2, 4],
                'monetary' => [500, 1500],
            ],
        ];

        $response = $this->postJson('/api/settings/analytics', $payload);

        $response->assertOk()->assertJson(array_merge($payload, []));

        $this->assertDatabaseHas('app_settings', [
            'key' => 'analytics_settings',
        ]);

        $this->getJson('/api/settings/analytics')
            ->assertOk()
            ->assertJson(array_merge($payload, []));
    }
}
