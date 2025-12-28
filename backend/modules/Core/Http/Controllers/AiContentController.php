<?php

namespace Modules\Core\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Storage;
use Modules\Core\Models\AiGeneration;
use Modules\Core\Services\AiContentGenerator;
use Modules\Core\Services\AiImageCollageBuilder;

class AiContentController extends Controller
{
    public function __construct(
        private readonly AiContentGenerator $generator,
        private readonly AiImageCollageBuilder $collageBuilder,
    ) {
    }

    public function generateText(Request $request)
    {
        $data = $request->validate([
            'scenario' => ['required', Rule::in(['product_description', 'category_page', 'article', 'email_reply', 'social_post', 'product_faq'])],
            'brief' => ['required', 'string', 'min:20', 'max:4000'],
            'tone' => ['nullable', 'string', 'max:255'],
            'audience' => ['nullable', 'string', 'max:255'],
            'context' => ['nullable', 'string', 'max:4000'],
            'language' => ['nullable', 'string', 'max:10'],
        ]);

        $result = $this->generator->generateText($data['scenario'], $data);
        $generation = AiGeneration::create([
            'user_id' => $request->user()->id,
            'type' => 'text',
            'scenario' => $data['scenario'],
            'payload' => [
                'brief' => $data['brief'],
                'tone' => $data['tone'] ?? null,
                'audience' => $data['audience'] ?? null,
                'context' => $data['context'] ?? null,
            ],
            'content' => $result['content'],
            'path' => $result['path'],
            'meta' => [
                'filename' => $result['filename'],
            ],
        ]);

        return response()->json([
            'scenario' => $result['scenario'],
            'content' => $result['content'],
            'path' => $result['path'],
            'url' => $result['url'],
            'filename' => $result['filename'],
            'created_at' => optional($generation->created_at)->toIso8601String(),
        ]);
    }

    public function generateImage(Request $request)
    {
        $data = $request->validate([
            'scenario' => ['required', Rule::in(['category_banner', 'product_image', 'marketing_visual', 'email_banner'])],
            'prompt' => ['required', 'string', 'min:10', 'max:2000'],
            'style' => ['nullable', 'string', 'max:255'],
            'size' => ['nullable', Rule::in(['512x512', '768x768', '1024x1024'])],
            'reference_images' => ['nullable', 'array', 'max:5'],
            'reference_images.*' => ['string', 'url'],
        ]);

        if (in_array($data['scenario'], ['product_image', 'marketing_visual'], true) && empty($data['reference_images'])) {
            return response()->json([
                'message' => 'Vyber alespoň jednu referenční fotku produktu.',
            ], 422);
        }

        $result = $this->generator->generateImage($data['scenario'], $data);
        $generation = AiGeneration::create([
            'user_id' => $request->user()->id,
            'type' => 'image',
            'scenario' => $data['scenario'],
            'payload' => [
                'prompt' => $data['prompt'],
                'style' => $data['style'] ?? null,
                'reference_images' => $data['reference_images'] ?? [],
            ],
            'path' => $result['path'],
            'meta' => [
                'filename' => $result['filename'],
                'size' => $result['size'],
                'reference_images' => $data['reference_images'] ?? [],
            ],
        ]);

        return response()->json([
            'scenario' => $result['scenario'],
            'url' => $result['url'],
            'path' => $result['path'],
            'filename' => $result['filename'],
            'size' => $result['size'],
            'reference_images' => $result['reference_images'] ?? [],
            'source_image_url' => $result['source_image_url'] ?? null,
            'created_at' => optional($generation->created_at)->toIso8601String(),
        ]);
    }

    public function editImage(Request $request)
    {
        $data = $request->validate([
            'prompt' => ['required', 'string', 'min:10', 'max:2000'],
            'image_url' => ['required', 'url'],
            'size' => ['nullable', 'regex:/^\d+x\d+$/'],
            'preserve_label' => ['nullable', 'boolean'],
            'background_mode' => ['nullable', Rule::in(['preserve', 'remove', 'solid'])],
            'background_color' => ['nullable', 'string', 'max:16'],
            'negative_prompt' => ['nullable', 'string', 'max:500'],
            'mask_path' => ['nullable', 'string'],
            'detail' => ['nullable', Rule::in(['low', 'standard', 'hd'])],
            'engine' => ['nullable', Rule::in(['classic', 'responses'])],
            'reference_images' => ['nullable', 'array', 'max:5'],
            'reference_images.*' => ['string', 'url'],
        ]);
        $preserveLabel = array_key_exists('preserve_label', $data) ? (bool) $data['preserve_label'] : true;
        $maskPath = $data['mask_path'] ?? null;
        $engine = $data['engine'] ?? 'classic';

        if ($engine === 'responses') {
            $result = $this->generator->editImageWithResponses([
                'prompt' => $data['prompt'],
                'image_url' => $data['image_url'],
                'size' => $data['size'] ?? '1024x1024',
                'preserve_label' => $preserveLabel,
                'background_mode' => $data['background_mode'] ?? null,
                'background_color' => $data['background_color'] ?? null,
                'negative_prompt' => $data['negative_prompt'] ?? null,
                'mask_path' => $maskPath,
                'detail' => $data['detail'] ?? null,
                'reference_images' => $data['reference_images'] ?? [],
            ]);
        } else {
            $result = $this->generator->editImage([
                'prompt' => $data['prompt'],
                'image_url' => $data['image_url'],
                'size' => $data['size'] ?? '1024x1024',
                'preserve_label' => $preserveLabel,
                'background_mode' => $data['background_mode'] ?? null,
                'background_color' => $data['background_color'] ?? null,
                'negative_prompt' => $data['negative_prompt'] ?? null,
                'mask_path' => $maskPath,
            ]);
        }

        $generation = AiGeneration::create([
            'user_id' => $request->user()->id,
            'type' => 'image',
            'scenario' => 'image_edit',
            'payload' => [
                'prompt' => $data['prompt'],
                'image_url' => $data['image_url'],
                'size' => $data['size'] ?? '1024x1024',
                'preserve_label' => $preserveLabel,
                'background_mode' => $data['background_mode'] ?? null,
                'background_color' => $data['background_color'] ?? null,
                'negative_prompt' => $data['negative_prompt'] ?? null,
                'mask_path' => $maskPath,
                'engine' => $engine,
                'detail' => $data['detail'] ?? null,
                'reference_images' => $data['reference_images'] ?? [],
            ],
            'path' => $result['path'],
            'meta' => [
                'filename' => $result['filename'],
                'size' => $result['size'],
                'source_image_url' => $result['source_image_url'] ?? $data['image_url'],
                'mask_path' => $maskPath,
                'engine' => $engine,
                'detail' => $result['detail'] ?? null,
            ],
        ]);

        return response()->json([
            'scenario' => $result['scenario'],
            'url' => $result['url'],
            'path' => $result['path'],
            'filename' => $result['filename'],
            'size' => $result['size'],
            'source_image_url' => $result['source_image_url'] ?? $data['image_url'],
            'mask_path' => $maskPath,
            'engine' => $engine,
            'detail' => $result['detail'] ?? null,
            'created_at' => optional($generation->created_at)->toIso8601String(),
        ]);
    }

    public function generateVideo(Request $request)
    {
        $data = $request->validate([
            'scenario' => ['required', Rule::in(['product_loop', 'lifestyle_spot', 'storyboard', 'mood_clip'])],
            'prompt' => ['required', 'string', 'min:10', 'max:2000'],
            'size' => ['nullable', Rule::in(['720x1280', '1280x720'])],
            'seconds' => ['nullable', 'integer', 'min:2', 'max:12'],
            'reference_images' => ['nullable', 'array', 'max:3'],
            'reference_images.*' => ['string', 'url'],
        ]);

        $result = $this->generator->createVideo($data);

        $generation = AiGeneration::create([
            'user_id' => $request->user()->id,
            'type' => 'video',
            'scenario' => $data['scenario'],
            'payload' => [
                'prompt' => $data['prompt'],
                'size' => $data['size'] ?? '720x1280',
                'seconds' => $data['seconds'] ?? null,
                'reference_images' => $data['reference_images'] ?? [],
            ],
            'path' => null,
            'meta' => [
                'job_id' => $result['job_id'],
                'status' => $result['status'],
                'eta' => $result['eta'] ?? null,
                'model' => $result['model'],
                'reference_images' => $data['reference_images'] ?? [],
            ],
        ]);

        return response()->json([
            'job_id' => $result['job_id'],
            'status' => $result['status'],
            'eta' => $result['eta'] ?? null,
            'scenario' => $generation->scenario,
            'generation_id' => $generation->id,
            'created_at' => optional($generation->created_at)->toIso8601String(),
        ]);
    }

    public function videoStatus(Request $request, string $jobId)
    {
        $generation = AiGeneration::query()
            ->where('user_id', $request->user()->id)
            ->where('type', 'video')
            ->where('meta->job_id', $jobId)
            ->firstOrFail();

        $remote = $this->generator->fetchVideoJob($jobId);
        $status = data_get($remote, 'status', 'unknown');

        $meta = array_merge($generation->meta ?? [], [
            'status' => $status,
            'eta' => data_get($remote, 'eta', $generation->meta['eta'] ?? null),
            'progress' => data_get($remote, 'progress'),
        ]);
        $generation->meta = $meta;
        $generation->save();

        if ($status === 'completed') {
            if (! $generation->path) {
                $download = $this->generator->downloadVideoContent($jobId);
                $generation->path = $download['path'];
                $generation->meta = array_merge($generation->meta ?? [], [
                    'filename' => $download['filename'],
                    'mime' => $download['mime'],
                ]);
                $generation->save();
            }

            return response()->json([
                'job_id' => $jobId,
                'status' => $status,
                'url' => Storage::disk('public')->url($generation->path),
                'path' => $generation->path,
                'filename' => $generation->meta['filename'] ?? basename($generation->path),
                'scenario' => $generation->scenario,
                'created_at' => optional($generation->created_at)->toIso8601String(),
            ]);
        }

        if ($status === 'failed') {
            $message = data_get($remote, 'error.message') ?? 'Generování videa selhalo.';

            return response()->json([
                'job_id' => $jobId,
                'status' => $status,
                'error' => $message,
            ], 422);
        }

        return response()->json([
            'job_id' => $jobId,
            'status' => $status,
            'eta' => data_get($remote, 'eta'),
            'progress' => data_get($remote, 'progress'),
        ]);
    }

    public function uploadImage(Request $request)
    {
        $data = $request->validate([
            'file' => ['required', 'file', 'image', 'max:30720'],
        ]);

        $path = $request->file('file')->store('ai/content/uploads/'.now()->format('Y/m'), 'public');

        return response()->json([
            'path' => $path,
            'url' => Storage::disk('public')->url($path),
            'filename' => basename($path),
        ]);
    }

    public function createCollage(Request $request)
    {
        $data = $request->validate([
            'images' => ['required', 'array', 'min:2', 'max:6'],
            'images.*' => ['string', 'url'],
            'layout' => ['nullable', Rule::in(['grid', 'row', 'column'])],
        ]);

        $result = $this->collageBuilder->build($data['images'], $data['layout'] ?? 'grid');

        return response()->json([
            'path' => $result['path'],
            'url' => $result['url'],
            'filename' => $result['filename'],
            'layout' => $result['layout'],
        ]);
    }

    public function history(Request $request)
    {
        $data = $request->validate([
            'type' => ['nullable', Rule::in(['text', 'image', 'video'])],
            'scenario' => ['nullable', 'string', 'max:64'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $query = AiGeneration::query()
            ->where('user_id', $request->user()->id)
            ->latest();

        if (! empty($data['type'])) {
            $query->where('type', $data['type']);
        }

        if (! empty($data['scenario'])) {
            $query->where('scenario', $data['scenario']);
        }

        $paginator = $query->paginate(10)->through(function (AiGeneration $generation) {
            return [
                'id' => $generation->id,
                'type' => $generation->type,
                'scenario' => $generation->scenario,
                'content' => $generation->content,
                'path' => $generation->path,
                'url' => $generation->path ? Storage::disk('public')->url($generation->path) : null,
                'meta' => $generation->meta,
                'payload' => $generation->payload,
                'created_at' => optional($generation->created_at)->toIso8601String(),
            ];
        });

        return response()->json($paginator);
    }
}
