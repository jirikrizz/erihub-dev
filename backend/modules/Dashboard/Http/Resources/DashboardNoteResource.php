<?php

namespace Modules\Dashboard\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Dashboard\Models\DashboardNote;

/**
 * @mixin DashboardNote
 */
class DashboardNoteResource extends JsonResource
{
    /**
     * @param Request $request
     * @return array<string, mixed>
     */
    public function toArray($request): array
    {
        /** @var DashboardNote $note */
        $note = $this->resource;
        $author = $note->author;

        return [
            'id' => $note->id,
            'title' => $note->title,
            'content' => $note->content,
            'visibility' => $note->visibility,
            'is_pinned' => (bool) $note->is_pinned,
            'created_at' => $note->created_at?->toIso8601String(),
            'updated_at' => $note->updated_at?->toIso8601String(),
            'author' => $author ? [
                'id' => $author->id,
                'name' => $author->name,
                'email' => $author->email,
            ] : null,
            'can_edit' => $request->user()?->id === $note->user_id,
        ];
    }
}
