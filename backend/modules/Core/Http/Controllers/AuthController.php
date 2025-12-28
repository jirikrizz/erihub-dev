<?php

namespace Modules\Core\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Hash;
use Modules\Admin\Support\AdminSection;
use Modules\Core\Services\UserPreferenceService;
use Modules\Core\Support\NotificationPreferenceNormalizer;

class AuthController extends Controller
{
    public function __construct(private readonly UserPreferenceService $preferences)
    {
    }

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string'],
        ]);

        /** @var User|null $user */
        $user = User::where('email', $credentials['email'])->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        $user->load(['roles', 'permissions']);

        $token = $user->createToken($credentials['device_name'] ?? 'frontend')->plainTextToken;

        $notificationPreferences = $this->preferences->get($user, 'notifications.events');
        $normalizedPreferences = NotificationPreferenceNormalizer::normalize(
            $notificationPreferences?->value,
            strict: false
        );

        return response()->json([
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'roles' => $user->getRoleNames()->values()->all(),
                'sections' => AdminSection::forUser($user),
                'notification_preferences' => $normalizedPreferences,
                'notification_preferences_updated_at' => $notificationPreferences?->updated_at?->toISOString(),
            ],
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()?->currentAccessToken()?->delete();

        return response()->json(['message' => 'Logged out']);
    }
}
