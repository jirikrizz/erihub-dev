<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Str;

class PreviewTokenService
{
    public function createPreviewToken(User $user): string
    {
        $payload = [
            'uid' => $user->id,
            'exp' => now()->addHours((int) env('PREVIEW_TOKEN_TTL_HOURS', 12))->timestamp,
            'ver' => sha1($user->password),
            'rnd' => Str::random(6),
        ];

        $body = $this->base64UrlEncode(json_encode($payload));
        $signature = $this->sign($body);

        return 'preview.'.$body.'.'.$signature;
    }

    public function validatePreviewToken(string $token): ?User
    {
        $parts = explode('.', $token);

        if (count($parts) !== 3 || $parts[0] !== 'preview') {
            return null;
        }

        [$prefix, $body, $signature] = $parts;

        if (! hash_equals($this->sign($body), $signature)) {
            return null;
        }

        $payload = json_decode($this->base64UrlDecode($body), true);

        if (! is_array($payload) || ! isset($payload['uid'], $payload['exp'], $payload['ver'])) {
            return null;
        }

        if ($payload['exp'] < now()->timestamp) {
            return null;
        }

        /** @var User|null $user */
        $user = User::find($payload['uid']);

        if (! $user) {
            return null;
        }

        if (! hash_equals(sha1($user->password), (string) $payload['ver'])) {
            return null;
        }

        return $user;
    }

    private function sign(string $body): string
    {
        return hash_hmac('sha256', $body, config('app.key'));
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function base64UrlDecode(string $value): string
    {
        return base64_decode(strtr($value, '-_', '+/')) ?: '';
    }
}
