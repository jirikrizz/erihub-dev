<?php

namespace Modules\Microsites\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Modules\Microsites\Jobs\MicrositeExportJob;
use Modules\Microsites\Jobs\MicrositePublishJob;
use Modules\Microsites\Models\Microsite;
use Modules\Microsites\Models\MicrositePublication;

class MicrositePublicationController extends Controller
{
    public function publish(Request $request, Microsite $microsite)
    {
        return $this->dispatchPublication($microsite, 'publish', $request);
    }

    public function unpublish(Microsite $microsite)
    {
        $settings = $microsite->settings ?? [];
        $publicationMeta = Arr::get($settings, 'publication', []);
        $path = $publicationMeta['path'] ?? null;

        if ($path) {
            $disk = Storage::disk('public');
            $disk->delete($path);
            $directory = trim(\dirname($path), '/');
            if ($directory !== '') {
                $disk->deleteDirectory($directory);
            }
        }

        $settings['publication'] = array_merge($publicationMeta, [
            'path' => null,
            'url' => null,
            'unpublished_at' => now()->toIso8601String(),
        ]);

        $microsite->forceFill([
            'status' => 'draft',
            'published_at' => null,
            'settings' => $settings,
        ])->save();

        return response()->json($microsite->fresh());
    }

    public function export(Request $request, Microsite $microsite)
    {
        return $this->dispatchPublication($microsite, 'export', $request);
    }

    private function dispatchPublication(Microsite $microsite, string $type, Request $request)
    {
        $publication = DB::transaction(function () use ($microsite, $type, $request) {
            $microsite->touch();

            return $microsite->publications()->create([
                'type' => $type,
                'status' => 'pending',
                'meta' => [
                    'initiated_by' => $request->user()?->id,
                    'notes' => $request->input('notes'),
                ],
            ]);
        });

        $job = match ($type) {
            'export' => new MicrositeExportJob($publication->id),
            default => new MicrositePublishJob($publication->id),
        };

        Bus::dispatch($job);

        return response()->json([
            'publication' => $publication,
            'microsite' => $microsite->fresh(),
        ], 202);
    }
}
