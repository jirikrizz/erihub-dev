<?php

namespace Modules\Core\Services;

use Illuminate\Support\Facades\Crypt;
use Modules\Core\Models\AppSetting;

class SettingsService
{
    public function getDecrypted(string $key): ?string
    {
        $setting = AppSetting::where('key', $key)->first();

        if (! $setting || $setting->value === null) {
            return null;
        }

        try {
            return Crypt::decryptString($setting->value);
        } catch (\Throwable $throwable) {
            // In case stored value is not encrypted for some reason, return null.
            return null;
        }
    }

    public function setEncrypted(string $key, ?string $value): void
    {
        if ($value === null || $value === '') {
            AppSetting::where('key', $key)->delete();

            return;
        }

        AppSetting::updateOrCreate(
            ['key' => $key],
            ['value' => Crypt::encryptString($value)]
        );
    }

    public function has(string $key): bool
    {
        return AppSetting::where('key', $key)->exists();
    }

    public function getJson(string $key, array $default = []): array
    {
        $setting = AppSetting::where('key', $key)->first();

        if (! $setting || $setting->value === null) {
            return $default;
        }

        try {
            $decoded = json_decode($setting->value, true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable $throwable) {
            return $default;
        }

        return is_array($decoded)
            ? array_replace_recursive($default, $decoded)
            : $default;
    }

    public function setJson(string $key, array $value): void
    {
        if ($value === []) {
            AppSetting::where('key', $key)->delete();

            return;
        }

        AppSetting::updateOrCreate(
            ['key' => $key],
            ['value' => json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]
        );
    }
}
