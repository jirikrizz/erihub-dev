<?php

namespace Modules\Dashboard\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Modules\Dashboard\Http\Requests\StoreDashboardNoteRequest;
use Modules\Dashboard\Http\Requests\UpdateDashboardNoteRequest;
use Modules\Dashboard\Http\Resources\DashboardNoteResource;
use Modules\Dashboard\Models\DashboardNote;

class DashboardNoteController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $userId = Auth::guard('sanctum')->id() ?? $request->user()?->getAuthIdentifier();
        $limit = (int) $request->integer('limit', 30);

        $notes = DashboardNote::query()
            ->with('author:id,name,email')
            ->where(function ($query) use ($userId) {
                $query->where('visibility', 'public');

                if ($userId !== null) {
                    $query->orWhere('user_id', $userId);
                }
            })
            ->orderByDesc('is_pinned')
            ->orderByDesc('created_at')
            ->limit($limit > 0 ? $limit : 30)
            ->get();

        return DashboardNoteResource::collection($notes)->response();
    }

    public function store(StoreDashboardNoteRequest $request): JsonResponse
    {
        $userId = Auth::guard('sanctum')->id() ?? $request->user()?->getAuthIdentifier();

        if ($userId === null) {
            abort(403, 'Pro vytvoření poznámky je nutné přihlášení.');
        }

        $note = DB::transaction(function () use ($request, $userId) {
            /** @var DashboardNote $note */
            $note = DashboardNote::query()->create([
                'user_id' => $userId,
                'title' => $request->filled('title') ? $request->string('title')->trim()->toString() : null,
                'content' => $request->string('content')->trim()->toString(),
                'visibility' => $request->string('visibility')->toString(),
                'is_pinned' => $request->boolean('is_pinned', false),
            ]);

            return $note->load('author:id,name,email');
        });

        return DashboardNoteResource::make($note)->response()->setStatusCode(201);
    }

    public function update(UpdateDashboardNoteRequest $request, DashboardNote $note): JsonResponse
    {
        $this->ensureCanMutate($request, $note);

        if ($request->has('title')) {
            $note->title = $request->filled('title')
                ? trim((string) $request->input('title'))
                : null;
        }

        if ($request->has('content')) {
            $note->content = trim((string) $request->input('content'));
        }

        if ($request->has('visibility')) {
            $note->visibility = $request->string('visibility')->toString();
        }

        if ($request->has('is_pinned')) {
            $note->is_pinned = (bool) $request->input('is_pinned');
        }

        $note->save();

        return DashboardNoteResource::make($note->loadMissing('author:id,name,email'))->response();
    }

    public function destroy(Request $request, DashboardNote $note): JsonResponse
    {
        $this->ensureCanMutate($request, $note);

        $note->delete();

        return response()->json(null, 204);
    }

    private function ensureCanMutate(Request $request, DashboardNote $note): void
    {
        $userId = Auth::guard('sanctum')->id() ?? $request->user()?->getAuthIdentifier();

        if ($userId === null || $note->user_id !== $userId) {
            abort(403, 'K této poznámce nemáš oprávnění.');
        }
    }
}
