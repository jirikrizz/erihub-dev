<?php

namespace Modules\Microsites\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Microsites\Services\MicrositeAiGenerator;

class MicrositeGenerationController extends Controller
{
    public function __construct(private readonly MicrositeAiGenerator $generator)
    {
    }

    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate([
            'brief' => ['required', 'string', 'min:20', 'max:2000'],
            'tone' => ['nullable', 'string', 'max:200'],
            'audience' => ['nullable', 'string', 'max:255'],
            'visual_keywords' => ['nullable', 'array', 'max:6'],
            'visual_keywords.*' => ['string', 'max:120'],
        ]);

        $result = $this->generator->generate($data);

        return response()->json($result);
    }
}
