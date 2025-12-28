<?php

namespace Tests\Feature;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Modules\Admin\Support\AdminSection;
use Modules\Core\Enums\JobScheduleFrequency;
use Modules\Core\Models\JobSchedule;
use Modules\Core\Models\NotificationUserState;
use Modules\Core\Services\SettingsService;
use Modules\Customers\Models\Customer;
use Modules\Customers\Models\CustomerMetric;
use Modules\Inventory\Support\InventoryNotificationSettings;
use Modules\Pim\Models\Product;
use Modules\Pim\Models\ProductVariant;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Models\SnapshotExecution;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class NotificationFeedTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        AdminSection::ensurePermissionsExist();
    }

    public function test_feed_returns_notifications_from_sources(): void
    {
        $user = $this->createUserWithNotificationsPermission();
        $this->seedNotificationSources();

        $response = $this->actingAs($user)->getJson('/api/notifications/logs');

        $response
            ->assertOk()
            ->assertJsonStructure([
                'logs',
                'unread_count',
                'fetched_at',
            ])
            ->assertJsonFragment(['event_id' => 'shoptet.snapshot-success'])
            ->assertJsonFragment(['event_id' => 'orders.import-failed'])
            ->assertJsonFragment(['event_id' => 'system.job-failed'])
            ->assertJsonFragment(['event_id' => 'customers.metrics-ready'])
            ->assertJsonFragment(['event_id' => 'customers.vip-created'])
            ->assertJsonFragment(['event_id' => 'inventory.low-stock'])
            ->assertJsonFragment(['event_id' => 'inventory.out-of-stock']);

        $this->assertSame(7, $response->json('unread_count'));
    }

    public function test_marking_notification_as_read_updates_state(): void
    {
        $user = $this->createUserWithNotificationsPermission();
        $this->seedNotificationSources();

        $feed = $this->actingAs($user)->getJson('/api/notifications/logs')->assertOk();
        $notificationId = $feed->json('logs.0.id');

        $markResponse = $this->postJson("/api/notifications/logs/{$notificationId}/read")
            ->assertOk()
            ->assertJsonStructure(['notification_id', 'unread_count']);

        $this->assertSame($notificationId, $markResponse->json('notification_id'));
        $this->assertSame(6, $markResponse->json('unread_count'));

        $this->assertDatabaseHas(NotificationUserState::class, [
            'user_id' => $user->id,
            'notification_id' => $notificationId,
        ]);
    }

    public function test_mark_all_as_read_accepts_ids(): void
    {
        $user = $this->createUserWithNotificationsPermission();
        $this->seedNotificationSources();

        $feed = $this->actingAs($user)->getJson('/api/notifications/logs');
        $ids = collect($feed->json('logs'))->take(3)->pluck('id')->all();

        $this->postJson('/api/notifications/logs/read-all', ['ids' => $ids])
            ->assertOk()
            ->assertJson(['unread_count' => 4]);

        foreach ($ids as $id) {
            $this->assertDatabaseHas(NotificationUserState::class, [
                'user_id' => $user->id,
                'notification_id' => $id,
            ]);
        }
    }

    public function test_access_is_denied_without_permission(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->getJson('/api/notifications/logs')->assertForbidden();
    }

    private function createUserWithNotificationsPermission(): User
    {
        $user = User::factory()->create();

        $role = Role::firstOrCreate(['name' => 'notifier', 'guard_name' => 'web']);
        $role->givePermissionTo(AdminSection::permissionFor('notifications'));
        $user->assignRole($role);

        return $user;
    }

    private function seedNotificationSources(): void
    {
        $shop = Shop::query()->create([
            'name' => 'Test Shop',
            'domain' => 'test-shop.example',
            'default_locale' => 'cs',
            'timezone' => 'Europe/Prague',
        ]);

        SnapshotExecution::query()->create([
            'shop_id' => $shop->id,
            'endpoint' => '/api/products/snapshot',
            'status' => 'completed',
            'requested_at' => CarbonImmutable::now()->subMinutes(15),
            'started_at' => CarbonImmutable::now()->subMinutes(14),
            'finished_at' => CarbonImmutable::now()->subMinutes(13),
            'meta' => ['processed_count' => 120],
        ]);

        SnapshotExecution::query()->create([
            'shop_id' => $shop->id,
            'endpoint' => '/api/orders/snapshot',
            'status' => 'error',
            'requested_at' => CarbonImmutable::now()->subMinutes(12),
            'started_at' => CarbonImmutable::now()->subMinutes(11),
            'finished_at' => CarbonImmutable::now()->subMinutes(10),
            'meta' => ['error' => 'http_500'],
        ]);

        JobSchedule::query()->create([
            'name' => 'Orders fetch',
            'job_type' => 'orders.fetch_new',
            'frequency' => JobScheduleFrequency::HOURLY,
            'cron_expression' => '0 * * * *',
            'timezone' => 'Europe/Prague',
            'shop_id' => $shop->id,
            'options' => [],
            'enabled' => true,
            'last_run_at' => CarbonImmutable::now()->subMinutes(9),
            'last_run_ended_at' => CarbonImmutable::now()->subMinutes(8),
            'last_run_status' => 'failed',
            'last_run_message' => 'HTTP 500',
        ]);

        JobSchedule::query()->create([
            'name' => 'Customer metrics',
            'job_type' => 'customers.recalculate_metrics',
            'frequency' => JobScheduleFrequency::DAILY,
            'cron_expression' => '0 3 * * *',
            'timezone' => 'Europe/Prague',
            'options' => [],
            'enabled' => true,
            'last_run_at' => CarbonImmutable::now()->subMinutes(7),
            'last_run_ended_at' => CarbonImmutable::now()->subMinutes(6),
            'last_run_status' => 'completed',
        ]);

        $product = Product::query()->create([
            'id' => (string) Str::uuid(),
            'shop_id' => $shop->id,
            'external_guid' => (string) Str::uuid(),
            'sku' => 'PROD-001',
            'status' => 'active',
        ]);

        ProductVariant::query()->create([
            'id' => (string) Str::uuid(),
            'product_id' => $product->id,
            'code' => 'VAR-LOW',
            'sku' => 'LOW-001',
            'name' => 'Varianta s nízkou zásobou',
            'stock' => 3,
            'min_stock_supply' => 8,
            'unit' => 'ks',
        ]);

        $soldOutVariant = ProductVariant::query()->create([
            'id' => (string) Str::uuid(),
            'product_id' => $product->id,
            'code' => 'VAR-SOLD',
            'sku' => 'SOLD-001',
            'name' => 'Varianta vyprodaná',
            'stock' => 0,
            'min_stock_supply' => 5,
            'unit' => 'ks',
        ]);

        app(SettingsService::class)->setJson(
            InventoryNotificationSettings::SETTINGS_KEY,
            [
                'low_stock_threshold' => 5,
                'watch_variant_ids' => [$soldOutVariant->id],
            ]
        );

        $customerGuid = (string) Str::uuid();

        Customer::query()->create([
            'id' => (string) Str::uuid(),
            'shop_id' => $shop->id,
            'guid' => $customerGuid,
            'full_name' => 'Jana Malá',
            'email' => 'jana@example.com',
        ]);

        CustomerMetric::query()->create([
            'customer_guid' => $customerGuid,
            'orders_count' => 6,
            'total_spent' => 28500,
            'total_spent_base' => 28500,
            'first_order_at' => CarbonImmutable::now()->subMonths(2),
            'last_order_at' => CarbonImmutable::now()->subMinutes(5),
        ]);
    }
}
