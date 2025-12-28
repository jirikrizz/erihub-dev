<?php

namespace Modules\Shoptet\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Carbon\Carbon;
use Modules\Shoptet\Contracts\ShoptetClient;
use Modules\Shoptet\Jobs\DownloadShoptetSnapshot;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Models\ShoptetWebhookJob;

class WebhookController extends Controller
{
    public function handle(Request $request, ?Shop $shop, ShoptetClient $client)
    {
        if (! $shop) {
            $token = (string) ($request->query('token') ?: $request->header('X-Shop-Token', ''));
            abort_if($token === '', 401, 'Missing shop token.');

            $shop = Shop::where('webhook_token', $token)->first();
            abort_unless($shop, 404, 'Shop not found for provided token.');
        }

        $signature = (string) $request->header('Shoptet-Webhook-Signature', '');
        $secret = (string) $shop->webhook_secret;

        abort_if($secret === '', 503, 'Webhook signature key not configured.');
        abort_if($signature === '', 401, 'Missing webhook signature.');

        $rawPayload = (string) $request->getContent();
        $expectedSignature = hash_hmac('sha1', $rawPayload, $secret);

        if (! hash_equals($expectedSignature, $signature)) {
            Log::warning('Invalid Shoptet webhook signature', [
                'shop_id' => $shop->id,
            ]);

            abort(401, 'Invalid webhook signature.');
        }

        try {
            $payload = json_decode($rawPayload, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException $exception) {
            abort(400, 'Invalid JSON payload');
        }
        abort_unless(is_array($payload), 400, 'Invalid JSON payload');

        $eventInstance = Arr::get($payload, 'eventInstance');
        $candidateIds = [
            Arr::get($payload, 'jobId'),
            Arr::get($payload, 'data.jobId'),
            Arr::get($payload, 'job.jobId'),
            Arr::get($payload, 'job.id'),
            Arr::get($payload, 'id'),
            $eventInstance,
        ];

        $jobIdentifier = null;

        foreach ($candidateIds as $candidate) {
            if (is_string($candidate) && $candidate !== '') {
                $jobIdentifier = $candidate;
                break;
            }
        }

        if (! $jobIdentifier) {
            $jobIdentifier = (string) Str::uuid();
        }

        $event = (string) (Arr::get($payload, 'event') ?: 'unknown');

        /** @var ShoptetWebhookJob $job */
        $job = ShoptetWebhookJob::firstOrNew([
            'shop_id' => $shop->id,
            'job_id' => $jobIdentifier,
        ]);

        $job->fill([
            'event' => $event,
            'payload' => $payload,
        ]);

        if (! $job->status) {
            $job->status = 'received';
        }

        $meta = $job->meta ?? [];

        if ($eventInstance) {
            $instances = array_unique(array_merge((array) ($meta['event_instances'] ?? []), [$eventInstance]));
            $meta['event_instances'] = $instances;
        }

        $job->meta = $meta;
        $job->save();

        Log::info('Shoptet webhook received', [
            'shop_id' => $shop->id,
            'job_db_id' => $job->id,
            'job_id' => $job->job_id,
            'event' => $event,
        ]);

        if ($event === 'job:finished') {
            $this->hydrateJobDetails($client, $job);

            if ($job->result_url) {
                DownloadShoptetSnapshot::dispatch($job, true, true);
            }
        }

        return response()->json([
            'ok' => true,
            'job' => [
                'id' => $job->id,
                'job_id' => $job->job_id,
                'status' => $job->status,
            ],
        ]);
    }

    private function hydrateJobDetails(ShoptetClient $client, ShoptetWebhookJob $job): void
    {
        try {
            $details = $client->getJob($job->shop, $job->job_id);
        } catch (\Throwable $throwable) {
            Log::warning('Unable to fetch Shoptet job details', [
                'job_id' => $job->job_id,
                'exception' => $throwable->getMessage(),
            ]);

            return;
        }

        $job->endpoint = $details['endpoint'] ?? $job->endpoint;
        $job->result_url = $details['resultUrl'] ?? $job->result_url;
        $job->valid_until = isset($details['validUntil']) ? Carbon::parse($details['validUntil']) : $job->valid_until;
        $job->status = $details['status'] ?? $job->status;
        $job->meta = array_merge($job->meta ?? [], ['job_details' => $details]);
        $job->save();
    }
}
