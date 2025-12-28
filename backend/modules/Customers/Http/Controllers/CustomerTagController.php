<?php

namespace Modules\Customers\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Modules\Customers\Models\CustomerTag;

class CustomerTagController extends Controller
{
    public function index()
    {
        $tags = CustomerTag::query()
            ->orderBy('name')
            ->get()
            ->map(function (CustomerTag $tag) {
                return [
                    'id' => $tag->id,
                    'name' => $tag->name,
                    'color' => $tag->color,
                    'is_hidden' => (bool) $tag->is_hidden,
                    'value' => $tag->name,
                    'label' => $tag->name,
                    'type' => 'managed',
                ];
            });

        return response()->json(['data' => $tags]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:customer_tags,name'],
            'color' => ['nullable', 'string', 'max:16'],
            'is_hidden' => ['sometimes', 'boolean'],
        ]);

        $tag = CustomerTag::create([
            'name' => $data['name'],
            'color' => $data['color'] ?? null,
            'is_hidden' => (bool) ($data['is_hidden'] ?? false),
        ]);

        return response()->json($tag, 201);
    }

    public function update(Request $request, CustomerTag $tag)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('customer_tags', 'name')->ignore($tag->id)],
            'color' => ['nullable', 'string', 'max:16'],
            'is_hidden' => ['sometimes', 'boolean'],
        ]);

        if (! array_key_exists('is_hidden', $data)) {
            $data['is_hidden'] = $tag->is_hidden;
        }

        $tag->update($data);

        return response()->json($tag);
    }

    public function destroy(CustomerTag $tag)
    {
        $tagName = $tag->name;

        DB::transaction(function () use ($tag, $tagName) {
            $tag->delete();

            $normalizedName = trim(mb_strtolower($tagName));
            if ($normalizedName === '') {
                return;
            }

            DB::table('customers')
                ->whereRaw(
                    "EXISTS (
                        SELECT 1
                        FROM jsonb_array_elements_text(COALESCE((customers.data->'tags')::jsonb, '[]'::jsonb)) AS t
                        WHERE LOWER(TRIM(t)) = ?
                    )",
                    [$normalizedName]
                )
                ->update([
                    'data' => DB::raw(
                        "jsonb_set(
                            COALESCE(customers.data::jsonb, '{}'::jsonb),
                            '{tags}',
                            COALESCE(
                                (
                                    SELECT jsonb_agg(t)
                                    FROM jsonb_array_elements_text(COALESCE((customers.data->'tags')::jsonb, '[]'::jsonb)) AS t
                                    WHERE LOWER(TRIM(t)) <> ".$this->quoteSqlString($normalizedName)."
                                ),
                                '[]'::jsonb
                            ),
                            true
                        )::json"
                    ),
                ]);
        });

        return response()->json(['message' => 'Tag odstraněn.']);
    }

    private function quoteSqlString(string $value): string
    {
        return DB::getPdo()->quote($value);
    }
}
