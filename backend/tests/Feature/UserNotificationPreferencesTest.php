<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Modules\Core\Models\UserPreference;
use Tests\TestCase;

class UserNotificationPreferencesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware();
    }

    public function test_it_stores_channel_preferences(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $payload = [
            'value' => [
                'inventory.low-stock' => ['ui' => false, 'email' => true],
                'orders.import-failed' => ['slack' => true],
            ],
        ];

        $response = $this->postJson('/api/settings/user-preferences/notifications.events', $payload);

        $response
            ->assertOk()
            ->assertJson([
                'key' => 'notifications.events',
                'value' => [
                    'inventory.low-stock' => ['ui' => false, 'email' => true],
                    'orders.import-failed' => ['slack' => true],
                ],
            ]);

        $preference = UserPreference::query()
            ->where('user_id', $user->id)
            ->where('key', 'notifications.events')
            ->firstOrFail();

        $this->assertSame(
            [
                'inventory.low-stock' => ['ui' => false, 'email' => true],
                'orders.import-failed' => ['slack' => true],
            ],
            $preference->value
        );
    }

    public function test_it_normalizes_legacy_boolean_preferences(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $payload = [
            'value' => [
                'inventory.low-stock' => true,
                'system.release-deployed' => false,
            ],
        ];

        $response = $this->postJson('/api/settings/user-preferences/notifications.events', $payload);

        $response
            ->assertOk()
            ->assertJson([
                'value' => [
                    'inventory.low-stock' => ['ui' => true],
                    'system.release-deployed' => ['ui' => false],
                ],
            ]);
    }

    public function test_it_rejects_unknown_events(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $payload = [
            'value' => [
                'unknown.event' => ['ui' => true],
            ],
        ];

        $response = $this->postJson('/api/settings/user-preferences/notifications.events', $payload);

        $response->assertStatus(422)->assertJsonValidationErrors(['value']);
    }

    public function test_it_rejects_unknown_channels(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $payload = [
            'value' => [
                'inventory.low-stock' => ['sms' => true],
            ],
        ];

        $response = $this->postJson('/api/settings/user-preferences/notifications.events', $payload);

        $response->assertStatus(422)->assertJsonValidationErrors(['value']);
    }
}
