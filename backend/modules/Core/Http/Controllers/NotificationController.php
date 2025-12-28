<?php

namespace Modules\Core\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Core\Services\NotificationFeedService;

class NotificationController extends Controller
{
    public function __construct(private readonly NotificationFeedService $feed)
    {
    }

    public function index(Request $request)
    {
        $user = $request->user();

        $payload = $this->feed->feedFor($user, $request->only([
            'limit',
            'status',
            'module',
            'severity',
            'search',
        ]));

        return response()->json($payload);
    }

    public function markAsRead(Request $request, string $notification)
    {
        $user = $request->user();

        $this->feed->markAsRead($user, $notification);

        return response()->json([
            'notification_id' => $notification,
            'unread_count' => $this->feed->countUnread($user),
        ]);
    }

    public function markAllAsRead(Request $request)
    {
        $data = $request->validate([
            'ids' => ['nullable', 'array'],
            'ids.*' => ['string', 'max:191'],
        ]);

        $user = $request->user();

        $this->feed->markAllAsRead($user, $data['ids'] ?? null);

        return response()->json([
            'unread_count' => $this->feed->countUnread($user),
        ]);
    }
}
