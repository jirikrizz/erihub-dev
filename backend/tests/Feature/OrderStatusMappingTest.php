<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OrderStatusMappingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware();
    }

    public function test_it_returns_default_mapping(): void
    {
        $this->getJson('/api/settings/orders-status-mapping')
            ->assertOk()
            ->assertJson([
                'completed' => [],
                'returned' => [],
                'complaint' => [],
                'cancelled' => [],
                'available_statuses' => [],
            ]);
    }

    public function test_it_stores_mapping(): void
    {
        $payload = [
            'completed' => ['Delivered', ' delivered '],
            'returned' => ['Return', ''],
            'complaint' => ['Complaint'],
            'cancelled' => [' Cancelled '],
        ];

        $expected = [
            'completed' => ['Delivered'],
            'returned' => ['Return'],
            'complaint' => ['Complaint'],
            'cancelled' => ['Cancelled'],
            'available_statuses' => [],
        ];

        $this->postJson('/api/settings/orders-status-mapping', $payload)
            ->assertOk()
            ->assertJson($expected);

        $this->getJson('/api/settings/orders-status-mapping')
            ->assertOk()
            ->assertJson($expected);
    }
}
