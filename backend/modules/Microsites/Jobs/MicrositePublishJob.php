<?php

namespace Modules\Microsites\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Modules\Microsites\Models\Microsite;
use Modules\Microsites\Models\MicrositePublication;
use Modules\Microsites\Services\MicrositeBuilderService;

class MicrositePublishJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(private readonly int $publicationId)
    {
        $this->queue = 'microsites';
    }

    public function handle(MicrositeBuilderService $builder): void
    {
        /** @var MicrositePublication|null $publication */
        $publication = MicrositePublication::query()->find($this->publicationId);

        if (! $publication) {
            return;
        }

        $publication->update(['status' => 'running']);

        try {
            $microsite = $publication->microsite()->with('products')->firstOrFail();

            $result = $builder->buildAndPublish($microsite, $publication);

            $microsite->forceFill([
                'status' => 'published',
                'published_at' => now(),
            ])->save();

            $publication->update([
                'status' => 'completed',
                'meta' => array_merge($publication->meta ?? [], [
                    'public_path' => $result['path'] ?? null,
                    'public_url' => $result['url'] ?? null,
                ]),
            ]);
        } catch (\Throwable $throwable) {
            $publication->update([
                'status' => 'failed',
                'error_message' => $throwable->getMessage(),
            ]);

            throw $throwable;
        }
    }
}
