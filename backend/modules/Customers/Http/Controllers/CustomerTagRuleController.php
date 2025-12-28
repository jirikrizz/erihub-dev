<?php

namespace Modules\Customers\Http\Controllers;

use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Modules\Customers\Jobs\RebuildCustomerTagRulesJob;
use Modules\Customers\Models\CustomerTagRule;
use Modules\Customers\Services\CustomerTagRuleEngine;
use Modules\Shoptet\Models\Shop;

class CustomerTagRuleController extends Controller
{
    public function __construct(private readonly CustomerTagRuleEngine $ruleEngine)
    {
        $this->middleware('permission:section.settings.customers');
    }

    public function index(Request $request)
    {
        $rules = CustomerTagRule::query()
            ->orderByDesc('priority')
            ->orderBy('label')
            ->get();

        return response()->json([
            'data' => $rules,
            'meta' => [
                'fields' => array_values($this->conditionDefinitionsWithOptions()),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $payload = $this->validatedPayload($request);

        $rule = CustomerTagRule::create($payload);
        $this->ruleEngine->refreshRules();

        RebuildCustomerTagRulesJob::dispatch()->onQueue('customers');

        return response()->json($rule, 201);
    }

    public function update(Request $request, CustomerTagRule $rule)
    {
        $payload = $this->validatedPayload($request, $rule);

        $rule->fill($payload);
        $rule->save();

        $this->ruleEngine->refreshRules();
        RebuildCustomerTagRulesJob::dispatch()->onQueue('customers');

        return response()->json($rule->refresh());
    }

    public function destroy(CustomerTagRule $rule)
    {
        $rule->delete();
        $this->ruleEngine->refreshRules();
        RebuildCustomerTagRulesJob::dispatch()->onQueue('customers');

        return response()->json(['status' => 'deleted']);
    }

    /**
     * @return array{
     *   tag_key: string,
     *   label: string,
     *   color: string,
     *   priority: int,
     *   is_active: bool,
     *   match_type: string,
     *   set_vip: bool,
     *   description: ?string,
     *   conditions: array<int, array<string, mixed>>,
     *   metadata: array<string, mixed>|null
     * }
     */
    private function validatedPayload(Request $request, ?CustomerTagRule $rule = null): array
    {
        $definitions = $this->conditionDefinitions();
        $definitionKeys = array_keys($definitions);

        $validated = $request->validate([
            'tag_key' => [
                'required',
                'string',
                'max:64',
                'regex:/^[a-z0-9_\-]+$/i',
                Rule::unique('customer_tag_rules', 'tag_key')
                    ->ignore($rule?->id),
            ],
            'label' => ['required', 'string', 'max:255'],
            'color' => ['nullable', 'string', 'max:32'],
            'priority' => ['nullable', 'integer'],
            'is_active' => ['sometimes', 'boolean'],
            'match_type' => ['nullable', Rule::in(['all', 'any'])],
            'set_vip' => ['sometimes', 'boolean'],
            'description' => ['nullable', 'string'],
            'conditions' => ['nullable', 'array', 'max:50'],
            'conditions.*.field' => ['required_with:conditions', Rule::in($definitionKeys)],
            'conditions.*.operator' => ['required_with:conditions', 'string', 'max:32'],
            'conditions.*.value' => ['nullable'],
        ]);

        $tagKey = Str::slug((string) $validated['tag_key']);
        if ($tagKey === '') {
            $tagKey = Str::lower((string) $validated['tag_key']);
        }
        $label = trim((string) $validated['label']);

        $conditions = $this->sanitizeConditions($validated['conditions'] ?? []);

        return [
            'tag_key' => $tagKey,
            'label' => $label,
            'color' => $validated['color'] ?? 'gray',
            'priority' => (int) ($validated['priority'] ?? 0),
            'is_active' => $validated['is_active'] ?? true,
            'match_type' => strtolower((string) ($validated['match_type'] ?? 'all')) === 'any' ? 'any' : 'all',
            'set_vip' => (bool) ($validated['set_vip'] ?? false),
            'description' => $validated['description'] ?? null,
            'conditions' => $conditions,
            'metadata' => [
                'created_via' => 'ui',
                'updated_at' => now()->toIso8601String(),
            ],
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function sanitizeConditions(?array $conditions): array
    {
        if (! is_array($conditions)) {
            return [];
        }

        $definitions = $this->conditionDefinitions();
        $sanitized = [];

        foreach ($conditions as $condition) {
            if (! is_array($condition)) {
                continue;
            }

            $field = (string) ($condition['field'] ?? '');
            if (! isset($definitions[$field])) {
                continue;
            }

            $definition = $definitions[$field];
            $operator = strtolower((string) ($condition['operator'] ?? ''));
            if (! in_array($operator, $definition['operators'], true)) {
                continue;
            }

            $value = $condition['value'] ?? null;
            $type = $definition['type'];

            if ($type === 'number') {
                if ($value === null || $value === '') {
                    continue;
                }
                if (! is_numeric($value)) {
                    continue;
                }
                $value = (float) $value;
            } elseif ($type === 'string') {
                if (in_array($operator, ['in', 'not_in'], true)) {
                    $value = array_values(array_filter(array_map(static function ($item) {
                        return is_string($item) ? Str::lower(trim($item)) : null;
                    }, Arr::wrap($value)), static fn ($item) => $item !== null));

                    if ($value === []) {
                        continue;
                    }
                } elseif (! in_array($operator, ['is_null', 'is_not_null'], true)) {
                    if (! is_string($value) || trim($value) === '') {
                        continue;
                    }
                    $value = Str::lower(trim($value));
                } else {
                    $value = null;
                }
            } elseif ($type === 'datetime') {
                if (! in_array($operator, ['is_null', 'is_not_null'], true)) {
                    if (! is_string($value) || trim($value) === '') {
                        continue;
                    }
                    $value = trim((string) $value);
                    try {
                        CarbonImmutable::parse($value);
                    } catch (\Throwable) {
                        continue;
                    }
                } else {
                    $value = null;
                }
            } elseif ($type === 'boolean') {
                $value = null;
            }

            $sanitized[] = [
                'field' => $field,
                'operator' => $operator,
                'value' => $value,
                'type' => $type,
            ];
        }

        return $sanitized;
    }

    /**
     * @return array<string, array{
     *   value: string,
     *   label: string,
     *   type: string,
     *   operators: array<int, string>,
     *   description?: string,
     *   options?: array<int, array<string, string>>
     * }>
     */
    private function conditionDefinitionsWithOptions(): array
    {
        $definitions = $this->conditionDefinitions();

        $providerOptions = Shop::query()
            ->select('provider')
            ->whereNotNull('provider')
            ->distinct()
            ->pluck('provider')
            ->filter(fn ($value) => is_string($value) && $value !== '')
            ->map(fn ($value) => [
                'value' => $value,
                'label' => Str::upper($value),
            ])
            ->values()
            ->all();

        if ($providerOptions === []) {
            $providerOptions = [
                ['value' => 'shoptet', 'label' => 'Shoptet'],
                ['value' => 'woocommerce', 'label' => 'WooCommerce'],
            ];
        }

        $definitions['provider']['options'] = $providerOptions;

        return $definitions;
    }

    /**
     * @return array<string, array{
     *   value: string,
     *   label: string,
     *   type: string,
     *   operators: array<int, string>,
     *   description?: string
     * }>
     */
    private function conditionDefinitions(): array
    {
        return [
            'orders_count' => [
                'value' => 'orders_count',
                'label' => 'Počet dokončených objednávek',
                'type' => 'number',
                'operators' => ['>=', '>', '<=', '<', '=', '!='],
            ],
            'total_spent_base' => [
                'value' => 'total_spent_base',
                'label' => 'Celková útrata v základní měně',
                'type' => 'number',
                'operators' => ['>=', '>', '<=', '<', '=', '!='],
            ],
            'average_order_value_base' => [
                'value' => 'average_order_value_base',
                'label' => 'Průměrná hodnota objednávky v základní měně',
                'type' => 'number',
                'operators' => ['>=', '>', '<=', '<', '=', '!='],
            ],
            'last_order_days_ago' => [
                'value' => 'last_order_days_ago',
                'label' => 'Dní od poslední objednávky',
                'type' => 'number',
                'operators' => ['>=', '>', '<=', '<', '=', '!='],
            ],
            'first_order_days_ago' => [
                'value' => 'first_order_days_ago',
                'label' => 'Dní od první objednávky',
                'type' => 'number',
                'operators' => ['>=', '>', '<=', '<', '=', '!='],
            ],
            'last_order_at' => [
                'value' => 'last_order_at',
                'label' => 'Datum poslední objednávky',
                'type' => 'datetime',
                'operators' => ['after', 'before', 'on_or_after', 'on_or_before', '=', '!=', 'is_null', 'is_not_null'],
            ],
            'first_order_at' => [
                'value' => 'first_order_at',
                'label' => 'Datum první objednávky',
                'type' => 'datetime',
                'operators' => ['after', 'before', 'on_or_after', 'on_or_before', '=', '!=', 'is_null', 'is_not_null'],
            ],
            'provider' => [
                'value' => 'provider',
                'label' => 'Zdroj obchodu',
                'type' => 'string',
                'operators' => ['=', '!=', 'in', 'not_in', 'is_null', 'is_not_null'],
            ],
            'shop_id' => [
                'value' => 'shop_id',
                'label' => 'Konkrétní obchod',
                'type' => 'number',
                'operators' => ['=', '!='],
            ],
            'customer_group' => [
                'value' => 'customer_group',
                'label' => 'Zákaznická skupina',
                'type' => 'string',
                'operators' => ['=', '!=', 'in', 'not_in', 'is_null', 'is_not_null'],
            ],
            'is_vip' => [
                'value' => 'is_vip',
                'label' => 'Aktuální VIP status',
                'type' => 'boolean',
                'operators' => ['is_true', 'is_false', '=', '!='],
            ],
        ];
    }
}
