<?php

namespace Modules\Core\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Imagick;
use RuntimeException;

class AiImageCollageBuilder
{
    /**
     * @param  string[]  $imageUrls
     */
    public function build(array $imageUrls, string $layout = 'grid'): array
    {
        $urls = array_values(array_filter(array_map('trim', $imageUrls)));

        if (count($urls) < 2) {
            throw new RuntimeException('Pro koláž vyber alespoň dvě fotky.');
        }

        if (count($urls) > 6) {
            throw new RuntimeException('Koláž momentálně podporuje maximálně 6 fotek.');
        }

        $images = $this->loadImages($urls);
        $layout = in_array($layout, ['grid', 'row', 'column'], true) ? $layout : 'grid';
        [$canvasWidth, $canvasHeight] = $this->canvasSize($layout, count($images));

        $canvas = new Imagick();
        $canvas->newImage($canvasWidth, $canvasHeight, 'white');
        $canvas->setImageFormat('png');

        $slots = $this->resolveSlots($layout, count($images), $canvasWidth, $canvasHeight);

        foreach ($images as $index => $image) {
            $slot = Arr::get($slots, $index);

            if (! $slot) {
                continue;
            }

            $image->resizeImage($slot['width'], $slot['height'], Imagick::FILTER_LANCZOS, 1, true);
            $canvas->compositeImage($image, Imagick::COMPOSITE_OVER, $slot['x'], $slot['y']);
        }

        $filename = sprintf('%s.png', Str::uuid()->toString());
        $path = sprintf('ai/content/collages/%s/%s', now()->format('Y/m'), $filename);
        Storage::disk('public')->put($path, $canvas->getImagesBlob());

        foreach ($images as $image) {
            $image->clear();
            $image->destroy();
        }
        $canvas->clear();
        $canvas->destroy();

        return [
            'path' => $path,
            'url' => Storage::disk('public')->url($path),
            'filename' => $filename,
            'layout' => $layout,
        ];
    }

    /**
     * @return Imagick[]
     */
    private function loadImages(array $urls): array
    {
        $images = [];

        foreach ($urls as $url) {
            try {
                $response = Http::timeout(30)->connectTimeout(5)->get($url);
            } catch (ConnectionException $exception) {
                Log::warning('AI collage image download failed', ['url' => $url, 'message' => $exception->getMessage()]);
                continue;
            }

            if ($response->failed() || ! $response->body()) {
                continue;
            }

            try {
                $imagick = new Imagick();
                $imagick->readImageBlob($response->body());
                $imagick->setImageFormat('png');
                $images[] = $imagick;
            } catch (\Throwable $throwable) {
                Log::warning('AI collage image parse failed', ['url' => $url, 'message' => $throwable->getMessage()]);
            }
        }

        if ($images === []) {
            throw new RuntimeException('Nepodařilo se načíst žádnou fotku pro koláž.');
        }

        return $images;
    }

    private function canvasSize(string $layout, int $count): array
    {
        return match ($layout) {
            'row' => [max(1024, 512 * $count), 768],
            'column' => [768, max(1024, 512 * $count)],
            default => [1200, 1200],
        };
    }

    private function resolveSlots(string $layout, int $count, int $width, int $height): array
    {
        $slots = [];

        if ($layout === 'row') {
            $slotWidth = (int) floor($width / $count);
            for ($i = 0; $i < $count; $i++) {
                $slots[] = [
                    'x' => $i * $slotWidth,
                    'y' => 0,
                    'width' => $slotWidth,
                    'height' => $height,
                ];
            }

            return $slots;
        }

        if ($layout === 'column') {
            $slotHeight = (int) floor($height / $count);
            for ($i = 0; $i < $count; $i++) {
                $slots[] = [
                    'x' => 0,
                    'y' => $i * $slotHeight,
                    'width' => $width,
                    'height' => $slotHeight,
                ];
            }

            return $slots;
        }

        $columns = $count > 2 ? 2 : $count;
        $rows = (int) ceil($count / $columns);
        $slotWidth = (int) floor($width / $columns);
        $slotHeight = (int) floor($height / $rows);

        for ($i = 0; $i < $count; $i++) {
            $row = (int) floor($i / $columns);
            $column = $i % $columns;

            $slots[] = [
                'x' => $column * $slotWidth,
                'y' => $row * $slotHeight,
                'width' => $slotWidth,
                'height' => $slotHeight,
            ];
        }

        return $slots;
    }
}
