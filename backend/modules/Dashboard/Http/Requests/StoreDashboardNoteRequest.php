<?php

namespace Modules\Dashboard\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreDashboardNoteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'title' => ['nullable', 'string', 'max:120'],
            'content' => ['required', 'string'],
            'visibility' => ['required', 'in:private,public'],
            'is_pinned' => ['sometimes', 'boolean'],
        ];
    }
}
