<?php

namespace Modules\Microsites\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Modules\Microsites\Models\MicrositePublication;
use Modules\Microsites\Services\MicrositeBuilderService;

class MicrositeExportJob implements ShouldQueue
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
            $artifact = $builder->buildExportBundle($microsite, $publication);

            $publication->update([
                'status' => 'completed',
                'meta' => array_merge($publication->meta ?? [], [
                    'artifact_path' => $artifact['path'] ?? null,
                    'artifact_url' => $artifact['url'] ?? null,
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
