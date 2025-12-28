<?php

namespace Modules\Core\Http\Controllers;

use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\Rule;
use Modules\Core\Models\ExportFeedLink;
use Modules\Core\Services\FeedExportService;
use Modules\Shoptet\Models\Shop;

class FeedExportController extends Controller
{
    public function __construct(private readonly FeedExportService $service)
    {
    }

    public function options(): JsonResponse
    {
        $shops = Shop::query()
            ->orderBy('name')
            ->get(['id', 'name', 'domain'])
            ->map(fn (Shop $shop) => [
                'id' => $shop->id,
                'name' => $shop->name,
                'domain' => $shop->domain,
            ])
            ->values()
            ->all();

        return response()->json([
            'feeds' => $this->service->definitions(),
            'formats' => $this->service->formatOptions(),
            'cache_intervals' => $this->service->cacheIntervals(),
            'relative_ranges' => $this->service->relativeRangeOptions(),
            'shops' => $shops,
        ]);
    }

    public function index(): JsonResponse
    {
        $links = ExportFeedLink::query()
            ->with('shop:id,name,domain')
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (ExportFeedLink $link) => $this->formatLink($link))
            ->values()
            ->all();

        return response()->json(['links' => $links]);
    }

    public function store(Request $request): JsonResponse
    {
        $definitions = $this->service->definitionKeys();
        $formats = $this->service->formatKeys();
        $cacheIntervals = $this->service->cacheIntervalValues();
        $relativeRanges = $this->service->relativeRangeValues();

        $validated = $request->validate([
            'name' => ['nullable', 'string', 'max:191'],
            'type' => ['required', Rule::in($definitions)],
            'shop_id' => ['nullable', 'integer', Rule::exists('shops', 'id')],
            'fields' => ['required', 'array', 'min:1'],
            'fields.*' => ['string'],
            'format' => ['required', Rule::in($formats)],
            'cache_ttl' => ['required', 'integer', Rule::in($cacheIntervals)],
            'range_mode' => ['required', Rule::in(['none', 'relative', 'absolute'])],
            'relative_interval' => ['nullable', 'integer', Rule::in($relativeRanges), 'required_if:range_mode,relative'],
            'date_from' => ['nullable', 'date', 'required_if:range_mode,absolute'],
            'date_to' => ['nullable', 'date', 'required_if:range_mode,absolute', 'after_or_equal:date_from'],
        ]);

        $type = $validated['type'];
        $fields = $this->service->validateFields($type, $validated['fields']);

        $link = new ExportFeedLink();
        $link->name = $validated['name'] ?? $this->defaultName($type);
        $link->type = $type;
        $link->shop_id = $validated['shop_id'] ?? null;
        $link->fields = $fields;
        $link->format = $validated['format'];
        $link->cache_ttl = (int) $validated['cache_ttl'];
        $link->range_mode = $validated['range_mode'];

        if ($link->range_mode === 'relative') {
            $link->relative_interval = (int) $validated['relative_interval'];
            $link->date_from = null;
            $link->date_to = null;
        } elseif ($link->range_mode === 'absolute') {
            $link->date_from = isset($validated['date_from']) ? CarbonImmutable::parse($validated['date_from']) : null;
            $link->date_to = isset($validated['date_to']) ? CarbonImmutable::parse($validated['date_to']) : null;
            $link->relative_interval = null;
        } else {
            $link->relative_interval = null;
            $link->date_from = null;
            $link->date_to = null;
        }

        $link->save();
        $link->load('shop:id,name,domain');

        return response()->json([
            'link' => $this->formatLink($link),
        ], 201);
    }

    public function destroy(ExportFeedLink $link): Response
    {
        $link->delete();

        return response()->noContent();
    }

    public function download(string $token)
    {
        $link = ExportFeedLink::query()->where('token', $token)->firstOrFail();

        $fields = $this->service->validateFields($link->type, $link->fields ?? []);

        [$from, $to, $bucket] = $this->resolveRange($link);
        $shopId = $link->shop_id !== null ? (int) $link->shop_id : null;

        $cacheKey = $this->cacheKey($link, $fields, $from, $to, $bucket, $shopId);
        $cacheTtl = max(60, (int) $link->cache_ttl);

        $payload = Cache::remember($cacheKey, $cacheTtl, function () use ($link, $fields, $from, $to, $shopId) {
            $rows = $this->service->buildFeed($link->type, $fields, $from, $to, $shopId);
            $content = $this->service->render($link->format, $link->type, $fields, $rows);

            return [
                'content' => $content,
                'generated_at' => now()->toIso8601String(),
            ];
        });

        $link->forceFill(['last_used_at' => now()])->saveQuietly();

        $filename = sprintf(
            '%s-feed-%s.%s',
            $link->type,
            now()->format('Ymd_His'),
            $link->format
        );

        $headers = match ($link->format) {
            'csv' => [
                'Content-Type' => 'text/csv; charset=utf-8',
                'Content-Disposition' => "attachment; filename=\"{$filename}\"",
            ],
            'xml' => [
                'Content-Type' => 'application/xml; charset=utf-8',
                'Content-Disposition' => "attachment; filename=\"{$filename}\"",
            ],
            default => [
                'Content-Type' => 'text/plain; charset=utf-8',
            ],
        };

        return response($payload['content'], 200, $headers);
    }

    private function defaultName(string $type): string
    {
        return sprintf('%s feed (%s)', ucfirst($type), now()->format('Y-m-d H:i'));
    }

    private function formatLink(ExportFeedLink $link): array
    {
        return [
            'id' => $link->id,
            'name' => $link->name,
            'type' => $link->type,
            'shop_id' => $link->shop_id !== null ? (int) $link->shop_id : null,
            'fields' => $link->fields,
            'format' => $link->format,
            'cache_ttl' => (int) $link->cache_ttl,
            'range_mode' => $link->range_mode,
            'relative_interval' => $link->relative_interval,
            'date_from' => $link->date_from?->toIso8601String(),
            'date_to' => $link->date_to?->toIso8601String(),
            'last_used_at' => $link->last_used_at?->toIso8601String(),
            'created_at' => $link->created_at?->toIso8601String(),
            'shop' => $link->shop ? [
                'id' => $link->shop->id,
                'name' => $link->shop->name,
                'domain' => $link->shop->domain,
            ] : null,
            'url' => URL::route('export-feeds.download', ['token' => $link->token]),
        ];
    }

    /**
     * @param  list<string>  $fields
     */
    private function cacheKey(
        ExportFeedLink $link,
        array $fields,
        ?CarbonImmutable $from,
        ?CarbonImmutable $to,
        string $bucket,
        ?int $shopId
    ): string {
        $parts = [
            'feed',
            $link->id,
            $link->type,
            $link->format,
            implode(',', $fields),
            $from?->toIso8601String() ?? 'null',
            $to?->toIso8601String() ?? 'null',
            $bucket,
            $shopId !== null ? "shop-{$shopId}" : 'shop-all',
        ];

        return implode(':', $parts);
    }

    /**
     * @return array{0: ?CarbonImmutable, 1: ?CarbonImmutable, 2: string}
     */
    private function resolveRange(ExportFeedLink $link): array
    {
        if ($link->range_mode === 'relative' && $link->relative_interval) {
            $now = CarbonImmutable::now();
            $from = $now->subSeconds($link->relative_interval);
            $bucket = (string) intdiv($now->timestamp, max(1, (int) $link->cache_ttl));

            return [$from, $now, $bucket];
        }

        if ($link->range_mode === 'absolute') {
            $from = $link->date_from ? CarbonImmutable::parse($link->date_from) : null;
            $to = $link->date_to ? CarbonImmutable::parse($link->date_to) : null;

            return [$from, $to, 'absolute'];
        }

        return [null, null, 'none'];
    }
}
