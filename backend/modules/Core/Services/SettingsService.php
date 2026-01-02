<?php

namespace Modules\Core\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Modules\Core\Models\AppSetting;

class SettingsService
{
    private const CACHE_TTL = 3600; // 1 hour

    public function getDecrypted(string $key): ?string
    {
        return Cache::remember("setting.decrypted.{$key}", self::CACHE_TTL, function () use ($key) {
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
        });
    }

    public function setEncrypted(string $key, ?string $value): void
    {
        Cache::forget("setting.decrypted.{$key}");

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
        return Cache::remember("setting.exists.{$key}", self::CACHE_TTL, function () use ($key) {
            return AppSetting::where('key', $key)->exists();
        });
    }

    public function getJson(string $key, array $default = []): array
    {
        return Cache::remember("setting.json.{$key}", self::CACHE_TTL, function () use ($key, $default) {
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
        });
    }

    public function setJson(string $key, array $value): void
    {
        Cache::forget("setting.json.{$key}");

        if ($value === []) {
            AppSetting::where('key', $key)->delete();

            return;
        }

        AppSetting::updateOrCreate(
            ['key' => $key],
            ['value' => json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]
        );
    }

    /**
     * Manually clear the cache for a specific setting, or all settings if key is null.
     */
    public function clearCache(?string $key = null): void
    {
        if ($key === null) {
            // Clear all setting caches
            Cache::tags(['settings'])->flush();
            return;
        }

        Cache::forget("setting.decrypted.{$key}");
        Cache::forget("setting.exists.{$key}");
        Cache::forget("setting.json.{$key}");
    }
}
