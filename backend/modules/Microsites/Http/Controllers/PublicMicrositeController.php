<?php

namespace Modules\Microsites\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Storage;
use Modules\Microsites\Models\Microsite;

class PublicMicrositeController extends Controller
{
    public function show(Request $request, string $slug)
    {
        $microsite = Microsite::query()
            ->where('slug', $slug)
            ->where('status', 'published')
            ->with(['products' => function ($query) {
                $query->orderBy('position');
            }])
            ->firstOrFail();

        $path = Arr::get($microsite->settings, 'publication.path') ?: sprintf('microshop/%s/index.html', $microsite->slug);

        if (Storage::disk('public')->exists($path)) {
            $html = Storage::disk('public')->get($path);

            return response($html, 200, [
                'Content-Type' => 'text/html; charset=utf-8',
                'Cache-Control' => 'public, max-age=300',
            ]);
        }

        return view('microsites::public', [
            'microsite' => $microsite,
        ]);
    }
}
