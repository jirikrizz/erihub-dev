<?php

namespace Modules\Core\Services;

use App\Models\User;
use Modules\Core\Models\UserPreference;

class UserPreferenceService
{
    public function get(User $user, string $key): ?UserPreference
    {
        return UserPreference::query()
            ->where('user_id', $user->id)
            ->where('key', $key)
            ->first();
    }

    public function set(User $user, string $key, ?array $value): ?UserPreference
    {
        if ($value === null) {
            UserPreference::query()
                ->where('user_id', $user->id)
                ->where('key', $key)
                ->delete();

            return null;
        }

        return UserPreference::query()->updateOrCreate(
            [
                'user_id' => $user->id,
                'key' => $key,
            ],
            ['value' => $value]
        );
    }
}
