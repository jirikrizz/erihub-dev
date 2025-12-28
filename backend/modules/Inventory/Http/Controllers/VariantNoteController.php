<?php

namespace Modules\Inventory\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Inventory\Models\ProductVariantNote;
use Modules\Pim\Models\ProductVariant;

class VariantNoteController extends Controller
{
    public function index(ProductVariant $variant)
    {
        $notes = $variant->notes()
            ->with('user:id,name,email')
            ->orderByDesc('created_at')
            ->get();

        return response()->json(['data' => $notes]);
    }

    public function store(Request $request, ProductVariant $variant)
    {
        $data = $request->validate([
            'note' => ['required', 'string', 'max:4000'],
        ]);

        /** @var User|null $user */
        $user = $request->user();

        $note = $variant->notes()->create([
            'note' => $data['note'],
            'user_id' => $user?->id,
        ]);

        $note->load('user:id,name,email');

        return response()->json($note, 201);
    }

    public function update(Request $request, ProductVariantNote $note)
    {
        $this->authorizeNote($note, $request);

        $data = $request->validate([
            'note' => ['required', 'string', 'max:4000'],
        ]);

        $note->update(['note' => $data['note']]);
        $note->load('user:id,name,email');

        return response()->json($note);
    }

    public function destroy(Request $request, ProductVariantNote $note)
    {
        $this->authorizeNote($note, $request);

        $note->delete();

        return response()->json(['message' => 'Poznámka odstraněna.']);
    }

    private function authorizeNote(ProductVariantNote $note, Request $request): void
    {
        if (! $request->user()) {
            abort(403);
        }

        // Zatím není potřeba detailní kontrola – pouze ověř, že existuje vztah
        if (! $note->relationLoaded('variant')) {
            $note->load('variant');
        }
    }
}
