<?php

namespace Modules\Dashboard\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateDashboardNoteRequest extends FormRequest
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
            'title' => ['sometimes', 'nullable', 'string', 'max:120'],
            'content' => ['sometimes', 'required', 'string'],
            'visibility' => ['sometimes', 'required', 'in:private,public'],
            'is_pinned' => ['sometimes', 'boolean'],
        ];
    }
}
