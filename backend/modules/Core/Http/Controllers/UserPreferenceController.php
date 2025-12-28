<?php

namespace Modules\Core\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use Modules\Core\Services\UserPreferenceService;
use Modules\Core\Support\NotificationPreferenceNormalizer;

class UserPreferenceController extends Controller
{
    public function __construct(private readonly UserPreferenceService $preferences)
    {
    }

    public function show(Request $request, string $key)
    {
        $user = $request->user();

        $preference = $this->preferences->get($user, $key);

        $value = $preference?->value;

        if ($key === 'notifications.events') {
            $value = NotificationPreferenceNormalizer::normalize($value, strict: false);
        }

        return response()->json([
            'key' => $key,
            'value' => $value,
            'updated_at' => $preference?->updated_at?->toISOString(),
        ]);
    }

    public function store(Request $request, string $key)
    {
        if ($key === 'notifications.events') {
            $data = $request->validate([
                'value' => ['nullable', 'array'],
            ]);

            try {
                $normalized = NotificationPreferenceNormalizer::normalize($data['value'] ?? null, strict: true);
            } catch (InvalidArgumentException $exception) {
                throw ValidationException::withMessages([
                    'value' => $exception->getMessage(),
                ]);
            }

            $value = $normalized;
        } else {
            $data = $request->validate([
                'value' => ['nullable', 'array'],
            ]);

            $value = $data['value'] ?? null;
        }

        $user = $request->user();

        $preference = $this->preferences->set($user, $key, $value);

        return response()->json([
            'key' => $key,
            'value' => $preference?->value,
            'updated_at' => $preference?->updated_at?->toISOString(),
        ]);
    }

    public function destroy(Request $request, string $key)
    {
        $user = $request->user();
        $this->preferences->set($user, $key, null);

        return response()->json([
            'key' => $key,
            'value' => null,
            'updated_at' => null,
        ]);
    }
}
