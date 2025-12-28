<?php

namespace Modules\Microsites\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class MicrositeAssetController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate([
            'file' => ['required', 'file', 'mimes:jpeg,jpg,png,webp,gif,avif,svg', 'max:8192'],
        ]);

        /** @var \Illuminate\Http\UploadedFile $file */
        $file = $data['file'];

        $directory = 'microsites/assets/'.now()->format('Y/m');
        $extension = $file->getClientOriginalExtension();
        $filename = Str::uuid()->toString().($extension ? '.'.$extension : '');

        $path = $file->storeAs($directory, $filename, [
            'disk' => 'public',
        ]);

        $disk = Storage::disk('public');
        $url = $disk->url($path);

        return response()->json([
            'url' => $url,
            'path' => $path,
            'name' => $file->getClientOriginalName(),
            'mime' => $file->getClientMimeType(),
            'size' => $file->getSize(),
        ]);
    }
}
