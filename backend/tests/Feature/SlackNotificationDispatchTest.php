<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Mockery;
use Modules\Core\Models\NotificationDelivery;
use Modules\Core\Services\NotificationFeedService;
use Modules\Core\Services\SettingsService;
use Modules\Core\Services\SlackNotificationDispatcher;
use Modules\Core\Services\UserPreferenceService;
use Tests\TestCase;

class SlackNotificationDispatchTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Mockery::close();

        parent::tearDown();
    }

    public function test_dispatch_sends_new_notifications(): void
    {
        /** @var SettingsService $settings */
        $settings = $this->app->make(SettingsService::class);
        $settings->setEncrypted('slack_bot_token', 'xoxb-test-token');
        $settings->setJson('slack_bot_settings', [
            'enabled' => true,
            'default_channel' => '#alerts',
        ]);

        $notification = [
            'id' => 'system_job_failed:123',
            'event_id' => 'system.job-failed',
            'title' => 'Queue job selhal',
            'message' => 'Job ProcessShoptetSnapshot selhal.',
            'severity' => 'error',
            'module' => 'system',
            'metadata' => [
                'shop_name' => 'Test shop',
            ],
        ];

        $feed = Mockery::mock(NotificationFeedService::class);
        $feed->shouldReceive('collectNotifications')
            ->andReturn(collect([$notification]));

        Http::fake([
            'https://slack.com/api/chat.postMessage' => Http::response(['ok' => true]),
        ]);

        $dispatcher = new SlackNotificationDispatcher($feed, $settings);
        $sent = $dispatcher->dispatch();

        $this->assertSame(1, $sent);

        Http::assertSent(function ($request) use ($notification) {
            $payload = $request->data();

            return $payload['channel'] === '#alerts'
                && str_contains($payload['text'], $notification['title'])
                && str_contains($payload['text'], 'Test shop');
        });

        $this->assertDatabaseHas('notification_deliveries', [
            'notification_id' => 'system_job_failed:123',
            'channel' => 'slack',
        ]);

        // Second run should skip already delivered notification.
        $feedRepeat = Mockery::mock(NotificationFeedService::class);
        $feedRepeat->shouldReceive('collectNotifications')
            ->andReturn(collect([$notification]));

        Http::fake(); // No requests expected

        $dispatcherRepeat = new SlackNotificationDispatcher($feedRepeat, $settings);
        $this->assertSame(0, $dispatcherRepeat->dispatch());

        Http::assertNothingSent();
        $this->assertSame(1, NotificationDelivery::query()->count());
    }

    public function test_dispatch_skips_when_disabled(): void
    {
        /** @var SettingsService $settings */
        $settings = $this->app->make(SettingsService::class);
        $settings->setEncrypted('slack_bot_token', 'xoxb-test-token');
        $settings->setJson('slack_bot_settings', [
            'enabled' => false,
            'default_channel' => '#alerts',
        ]);

        $feed = Mockery::mock(NotificationFeedService::class);
        $feed->shouldReceive('collectNotifications')->never();

        Http::fake();

        $dispatcher = new SlackNotificationDispatcher($feed, $settings);

        $this->assertSame(0, $dispatcher->dispatch());

        Http::assertNothingSent();
        $this->assertDatabaseCount('notification_deliveries', 0);
    }

    public function test_dispatch_respects_user_preference_overrides(): void
    {
        /** @var SettingsService $settings */
        $settings = $this->app->make(SettingsService::class);
        $settings->setEncrypted('slack_bot_token', 'xoxb-test-token');
        $settings->setJson('slack_bot_settings', [
            'enabled' => true,
            'default_channel' => '#alerts',
        ]);

        $user = User::factory()->create();

        /** @var UserPreferenceService $preferences */
        $preferences = $this->app->make(UserPreferenceService::class);
        $preferences->set($user, 'notifications.events', [
            'orders.status-changed' => ['slack' => true],
        ]);

        $notification = [
            'id' => 'orders_status_changed:1',
            'event_id' => 'orders.status-changed',
            'title' => 'Objednávka změnila stav',
            'message' => 'Objednávka #123 změnila stav na zaplaceno.',
            'severity' => 'info',
            'module' => 'orders',
        ];

        $feed = Mockery::mock(NotificationFeedService::class);
        $feed->shouldReceive('collectNotifications')
            ->andReturn(collect([$notification]));

        Http::fake([
            'https://slack.com/api/chat.postMessage' => Http::response(['ok' => true]),
        ]);

        $dispatcher = new SlackNotificationDispatcher($feed, $settings);

        $this->assertSame(1, $dispatcher->dispatch());

        Http::assertSent(function ($request) {
            $payload = $request->data();

            return $payload['channel'] === '#alerts'
                && str_contains($payload['text'], 'Objednávka změnila stav');
        });
    }
}
