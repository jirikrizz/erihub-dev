<?php

namespace Modules\Core\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Modules\Core\Models\NotificationDelivery;
use Modules\Core\Models\UserPreference;
use Modules\Core\Support\NotificationEventCatalog;
use Modules\Core\Support\NotificationPreferenceNormalizer;

class SlackNotificationDispatcher
{
    private const CHANNEL = 'slack';
    private const ENDPOINT = 'https://slack.com/api/chat.postMessage';

    /**
     * @var array<string, array<string, bool>>|null
     */
    private ?array $channelOverrides = null;

    public function __construct(
        private readonly NotificationFeedService $feed,
        private readonly SettingsService $settings
    ) {
    }

    public function dispatch(): int
    {
        $token = $this->settings->getDecrypted('slack_bot_token');
        $config = $this->settings->getJson('slack_bot_settings', $this->defaultSlackSettings());

        if (! $token || ! ($config['enabled'] ?? false)) {
            return 0;
        }

        $channel = $config['default_channel'] ?: config('services.slack.notifications.channel');

        if (! $channel) {
            Log::warning('Slack notification dispatch skipped – missing default channel.');

            return 0;
        }

        $notifications = $this->feed
            ->collectNotifications()
            ->filter(fn (array $notification) => $this->isEligible($notification));

        if ($notifications->isEmpty()) {
            return 0;
        }

        $dispatched = 0;

        foreach ($notifications as $notification) {
            if (NotificationDelivery::hasDelivered(self::CHANNEL, $notification['id'])) {
                continue;
            }

            $payload = $this->buildPayload($notification, $channel);

            try {
                $response = Http::withToken($token)
                    ->acceptJson()
                    ->post(self::ENDPOINT, $payload);
            } catch (\Throwable $throwable) {
                Log::warning('Slack notification dispatch failed', [
                    'notification_id' => $notification['id'],
                    'event_id' => $notification['event_id'],
                    'exception' => $throwable->getMessage(),
                ]);

                continue;
            }

            if (! $response->successful() || $response->json('ok') !== true) {
                Log::warning('Slack notification dispatch returned error', [
                    'notification_id' => $notification['id'],
                    'event_id' => $notification['event_id'],
                    'status' => $response->status(),
                    'body' => $response->json(),
                ]);

                continue;
            }

            NotificationDelivery::create([
                'notification_id' => $notification['id'],
                'event_id' => $notification['event_id'],
                'channel' => self::CHANNEL,
                'payload' => $payload,
                'delivered_at' => now(),
            ]);

            $dispatched++;
        }

        return $dispatched;
    }

    private function defaultSlackSettings(): array
    {
        return [
            'enabled' => false,
            'default_channel' => null,
        ];
    }

    /**
     * @param  array{
     *     id: string,
     *     event_id: string,
     *     title?: string,
     *     message?: string,
     *     severity?: string,
     *     module?: string,
     *     metadata?: array<string, mixed>
     * }  $notification
     */
    private function buildPayload(array $notification, string $channel): array
    {
        $text = $this->formatMessage($notification);

        return [
            'channel' => $channel,
            'text' => $text,
            'mrkdwn' => true,
            'blocks' => [
                [
                    'type' => 'section',
                    'text' => [
                        'type' => 'mrkdwn',
                        'text' => $text,
                    ],
                ],
            ],
        ];
    }

    /**
     * @param  array{
     *     severity?: string,
     *     title?: string,
     *     message?: string,
     *     module?: string,
     *     metadata?: array<string, mixed>
     * }  $notification
     */
    private function formatMessage(array $notification): string
    {
        $severity = $notification['severity'] ?? 'info';
        $module = $notification['module'] ?? null;

        $emoji = match ($severity) {
            'success' => ':white_check_mark:',
            'warning' => ':warning:',
            'error' => ':x:',
            default => ':information_source:',
        };

        $title = trim((string) ($notification['title'] ?? 'Notifikace'));
        $message = trim((string) ($notification['message'] ?? ''));

        $lines = [
            sprintf('%s *%s*', $emoji, $title),
        ];

        if ($message !== '') {
            $lines[] = $message;
        }

        if ($module) {
            $lines[] = sprintf('_%s_', Str::headline($module));
        }

        if (! empty($notification['metadata']['shop_name'])) {
            $lines[] = sprintf('Shop: %s', $notification['metadata']['shop_name']);
        }

        return implode("\n", $lines);
    }

    /**
     * @param  array{id: string, event_id: string}  $notification
     */
    private function isEligible(array $notification): bool
    {
        if (! isset($notification['event_id'])) {
            return false;
        }

        return $this->isChannelEnabled($notification['event_id'], self::CHANNEL);
    }

    private function isChannelEnabled(string $eventId, string $channel): bool
    {
        $overrides = $this->channelOverrides ??= $this->loadChannelOverrides();

        if (isset($overrides[$eventId]) && array_key_exists($channel, $overrides[$eventId])) {
            return (bool) $overrides[$eventId][$channel];
        }

        return NotificationEventCatalog::defaultForChannel($eventId, $channel);
    }

    /**
     * @return array<string, array<string, bool>>
     */
    private function loadChannelOverrides(): array
    {
        $overrides = [];

        UserPreference::query()
            ->where('key', 'notifications.events')
            ->pluck('value')
            ->each(function ($raw) use (&$overrides) {
                $normalized = NotificationPreferenceNormalizer::normalize($raw, strict: false) ?? [];

                foreach ($normalized as $eventId => $channels) {
                    foreach ($channels as $channel => $enabled) {
                        $overrides[$eventId][$channel] = (bool) $enabled;
                    }
                }
            });

        return $overrides;
    }
}
