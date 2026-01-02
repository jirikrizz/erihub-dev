<?php

namespace App\Support;

use Illuminate\Contracts\Auth\Factory as AuthFactory;
use Illuminate\Http\Request;
use Laravel\Sanctum\Guard;

class ReadOnlySanctumGuard extends Guard
{
    public function __invoke(Request $request)
    {
        if (env('APP_PREVIEW_READONLY', false)) {
            $token = $this->getTokenFromRequest($request);

            if ($token && str_starts_with($token, 'preview.')) {
                $user = app(PreviewTokenService::class)->validatePreviewToken($token);

                if ($user) {
                    return $user;
                }
            }
        }

        return parent::__invoke($request);
    }

    public function __construct(AuthFactory $auth, $expiration = null, $provider = null)
    {
        parent::__construct($auth, $expiration, $provider);
    }

    /**
     * Skip updating token metadata when running in read-only preview mode.
     */
    protected function updateLastUsedAt($accessToken)
    {
        // Intentionally no-op to keep DB read-only in preview.
    }
}
