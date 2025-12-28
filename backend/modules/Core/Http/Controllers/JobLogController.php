<?php

namespace Modules\Core\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class JobLogController extends Controller
{
    /**
     * @var array<string, array{label: string, path: string}>
     */
    private const SOURCES = [
        'queue-worker' => [
            'label' => 'Fronty (queue-worker)',
            'path' => 'logs/queue-worker.log',
        ],
        'job-schedules' => [
            'label' => 'Plánovač (job-schedules)',
            'path' => 'logs/job-schedules.log',
        ],
        'orders-recalc' => [
            'label' => 'Přepočty objednávek',
            'path' => 'logs/orders-recalc.log',
        ],
        'laravel' => [
            'label' => 'Laravel log',
            'path' => 'logs/laravel.log',
        ],
    ];

    public function index(Request $request): JsonResponse
    {
        $requestedSource = (string) $request->query('source', 'queue-worker');
        $limit = (int) $request->query('limit', 200);
        $limit = max(10, min($limit, 500));

        $availableSources = $this->availableSources();

        if (! isset(self::SOURCES[$requestedSource]) || ! isset($availableSources[$requestedSource])) {
            $requestedSource = array_key_first($availableSources) ?? 'queue-worker';
        }

        if (! isset($availableSources[$requestedSource])) {
            return response()->json([
                'source' => null,
                'sources' => [],
                'entries' => [],
                'limit' => $limit,
                'fetched_at' => now()->toISOString(),
            ]);
        }

        $descriptor = $availableSources[$requestedSource];
        $filePath = $descriptor['absolute_path'];

        $entries = $this->tailFile($filePath, $limit);

        return response()->json([
            'source' => [
                'key' => $requestedSource,
                'label' => $descriptor['label'],
                'path' => $descriptor['path'],
            ],
            'sources' => collect($availableSources)
                ->map(fn (array $meta, string $key) => [
                    'key' => $key,
                    'label' => $meta['label'],
                    'path' => $meta['path'],
                ])
                ->values()
                ->all(),
            'entries' => $entries,
            'limit' => $limit,
            'fetched_at' => now()->toISOString(),
        ]);
    }

    /**
     * @return array<string, array{label: string, path: string, absolute_path: string}>
     */
    private function availableSources(): array
    {
        $sources = [];

        foreach (self::SOURCES as $key => $meta) {
            $absolutePath = storage_path($meta['path']);

            if (! is_file($absolutePath)) {
                continue;
            }

            $sources[$key] = [
                'label' => $meta['label'],
                'path' => $meta['path'],
                'absolute_path' => $absolutePath,
            ];
        }

        return $sources;
    }

    /**
     * @return list<string>
     */
    private function tailFile(string $path, int $lines): array
    {
        if (! is_readable($path)) {
            return [];
        }

        $lines = max(1, $lines);
        $handle = fopen($path, 'rb');

        if (! $handle) {
            return [];
        }

        $buffer = '';
        $chunkSize = 4096;
        $lineCount = 0;

        fseek($handle, 0, SEEK_END);
        $position = ftell($handle);

        while ($position > 0 && $lineCount <= $lines) {
            $seek = max(0, $position - $chunkSize);
            $readLength = $position - $seek;

            fseek($handle, $seek);

            $chunk = fread($handle, $readLength);

            if ($chunk === false) {
                break;
            }

            $buffer = $chunk . $buffer;
            $lineCount = substr_count($buffer, "\n");
            $position = $seek;
        }

        fclose($handle);

        $buffer = trim($buffer, "\n");

        if ($buffer === '') {
            return [];
        }

        $allLines = preg_split("/\r\n|\n|\r/", $buffer) ?: [];

        if ($allLines === []) {
            return [];
        }

        $allLines = array_slice($allLines, -$lines);

        return array_values(array_map(static fn ($line) => (string) $line, $allLines));
    }
}
