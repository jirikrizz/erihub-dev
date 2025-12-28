<?php

namespace Modules\Microsites\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;
use Modules\Microsites\Models\Microsite;
use Modules\Microsites\Support\StorefrontPayloadBuilder;

class StorefrontMicroshopController extends Controller
{
    public function resolve(Request $request, StorefrontPayloadBuilder $builder)
    {
        $host = (string) $request->query('host', '');
        $slug = (string) $request->query('slug', '');

        if ($host === '' && $slug === '') {
            return response()->json([
                'message' => 'Specify host or slug parameter.',
            ], 422);
        }

        $query = Microsite::query()->where('status', 'published');

        if ($host !== '') {
            $normalizedHost = $this->normalizeHost($host);

            $query->where(function ($builder) use ($normalizedHost) {
                $builder->where('primary_domain', $normalizedHost)
                    ->orWhereJsonContains('domains', $normalizedHost)
                    ->orWhere('slug', $normalizedHost);
            });
        } elseif ($slug !== '') {
            $query->where('slug', $slug);
        }

        /** @var Microsite|null $microsite */
        $microsite = $query->first();

        if (! $microsite && $host !== '') {
            $subdomain = strtok($this->normalizeHost($host), '.');

            if ($subdomain) {
                $microsite = Microsite::query()
                    ->where('status', 'published')
                    ->where('slug', $subdomain)
                    ->first();
            }
        }

        if (! $microsite) {
            return response()->json([
                'message' => 'Microshop not found.',
            ], 404);
        }

        return response()->json($builder->build($microsite));
    }

    private function normalizeHost(string $host): string
    {
        $host = Str::lower($host);
        $host = preg_replace('~^https?://~', '', $host) ?? $host;

        if (str_contains($host, ':')) {
            $host = explode(':', $host)[0];
        }

        return trim($host);
    }
}
