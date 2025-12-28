<?php

namespace Modules\Microsites\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\ValidationException;
use Modules\Microsites\Services\MicrositeProductResolver;

class MicrositeProductController extends Controller
{
    public function __construct(private readonly MicrositeProductResolver $resolver)
    {
    }

    public function __invoke(Request $request)
    {
        $data = $request->validate([
            'code' => ['nullable', 'string'],
            'variant_id' => ['nullable', 'string'],
            'shop_id' => ['nullable', 'integer'],
        ]);

        if (empty($data['code']) && empty($data['variant_id'])) {
            throw ValidationException::withMessages([
                'code' => 'Zadej kód nebo ID varianty.',
            ]);
        }

        $snapshot = null;

        if (! empty($data['variant_id'])) {
            $snapshot = $this->resolver->snapshotByVariantId($data['variant_id'], $data['shop_id'] ?? null);
        }

        if (! $snapshot && ! empty($data['code'])) {
            $snapshot = $this->resolver->snapshotByVariantCode($data['code'], $data['shop_id'] ?? null);
        }

        if (! $snapshot) {
            return response()->json([
                'message' => 'Produkt s tímto identifikátorem se nepodařilo najít.',
            ], 404);
        }

        return response()->json([
            'snapshot' => $snapshot,
        ]);
    }
}
