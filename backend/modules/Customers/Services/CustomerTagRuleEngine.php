<?php

namespace Modules\Customers\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Modules\Customers\Models\Customer;
use Modules\Customers\Models\CustomerMetric;
use Modules\Customers\Models\CustomerTagRule;

class CustomerTagRuleEngine
{
    /** @var Collection<int, CustomerTagRule>|null */
    private ?Collection $rulesCache = null;

    /** @var bool|null */
    private ?bool $hasVipRuleCache = null;

    public function __construct(private readonly CustomerGroupService $groupService)
    {
    }

    /**
     * Apply active tag rules to the given customer.
     *
     * @return array{tags: array<int, array<string, mixed>>, vip_matched: bool, vip_rules_present: bool}
     */
    public function sync(Customer $customer, ?CustomerMetric $metrics = null, bool $persist = true): array
    {
        $metrics ??= $customer->relationLoaded('metrics')
            ? $customer->metrics
            : CustomerMetric::query()->find($customer->guid);

        $result = $this->evaluate($customer, $metrics);

        $data = $customer->data ?? [];
        $data['auto_tags'] = array_values(array_map(static function (array $tag) {
            return [
                'key' => $tag['key'],
                'label' => $tag['label'],
                'color' => $tag['color'],
                'source_rule_id' => $tag['rule_id'],
                'source_rule_name' => $tag['rule_label'],
            ];
        }, $result['tags']));

        $customer->data = $data;

        if ($result['vip_matched']) {
            $customer->is_vip = true;
        } elseif ($result['vip_rules_present']) {
            $customer->is_vip = false;
        }

        $this->groupService->refreshTagData($customer);

        if ($persist) {
            $customer->save();
        }

        return $result;
    }

    /**
     * @return array{tags: array<int, array<string, mixed>>, vip_matched: bool, vip_rules_present: bool}
     */
    public function evaluate(Customer $customer, ?CustomerMetric $metrics = null): array
    {
        $rules = $this->rules();
        $matched = [];
        $vipMatched = false;

        foreach ($rules as $rule) {
            if (! $this->ruleMatches($rule, $customer, $metrics)) {
                continue;
            }

            $tagKey = (string) $rule->tag_key;

            if (! isset($matched[$tagKey])) {
                $matched[$tagKey] = [
                    'key' => $tagKey,
                    'label' => $rule->label,
                    'color' => $rule->color ?: 'gray',
                    'rule_id' => $rule->getKey(),
                    'rule_label' => $rule->label,
                    'priority' => (int) $rule->priority,
                ];
            }

            if ($rule->set_vip) {
                $vipMatched = true;
            }
        }

        $matchedTags = collect($matched)
            ->sortByDesc('priority')
            ->values()
            ->all();

        return [
            'tags' => $matchedTags,
            'vip_matched' => $vipMatched,
            'vip_rules_present' => $this->hasVipRules(),
        ];
    }

    public function refreshRules(): void
    {
        $this->rulesCache = null;
        $this->hasVipRuleCache = null;
    }

    /**
     * @return Collection<int, CustomerTagRule>
     */
    private function rules(): Collection
    {
        if ($this->rulesCache === null) {
            $this->rulesCache = CustomerTagRule::query()
                ->where('is_active', true)
                ->orderByDesc('priority')
                ->orderBy('label')
                ->get();

            $this->hasVipRuleCache = $this->rulesCache
                ->contains(static fn (CustomerTagRule $rule) => (bool) $rule->set_vip);
        }

        return $this->rulesCache;
    }

    private function hasVipRules(): bool
    {
        if ($this->hasVipRuleCache === null) {
            $this->hasVipRuleCache = $this->rules()
                ->contains(static fn (CustomerTagRule $rule) => (bool) $rule->set_vip);
        }

        return $this->hasVipRuleCache;
    }

    private function ruleMatches(CustomerTagRule $rule, Customer $customer, ?CustomerMetric $metrics): bool
    {
        $conditions = $rule->conditions ?? [];
        if (! is_array($conditions) || $conditions === []) {
            return true;
        }

        $matchType = strtolower((string) $rule->match_type) === 'any' ? 'any' : 'all';

        $results = [];
        foreach ($conditions as $condition) {
            if (! is_array($condition)) {
                $results[] = false;
                continue;
            }

            $results[] = $this->conditionMatches($condition, $customer, $metrics);
        }

        if ($results === []) {
            return true;
        }

        if ($matchType === 'any') {
            return in_array(true, $results, true);
        }

        return ! in_array(false, $results, true);
    }

    private function conditionMatches(array $condition, Customer $customer, ?CustomerMetric $metrics): bool
    {
        $field = (string) ($condition['field'] ?? '');
        if ($field === '') {
            return false;
        }

        $operator = strtolower((string) ($condition['operator'] ?? ''));
        if ($operator === '') {
            return false;
        }

        $type = strtolower((string) ($condition['type'] ?? $this->defaultFieldType($field)));
        $value = $this->extractFieldValue($field, $customer, $metrics);

        return match ($type) {
            'number' => $this->compareNumber($value, $condition['value'] ?? null, $operator),
            'string' => $this->compareString($value, $condition['value'] ?? null, $operator),
            'boolean' => $this->compareBoolean($value, $operator),
            'datetime' => $this->compareDateTime($value, $condition['value'] ?? null, $operator),
            default => false,
        };
    }

    private function compareNumber(mixed $actual, mixed $expected, string $operator): bool
    {
        if (! is_numeric($actual)) {
            return false;
        }

        if ($expected === null || $expected === '') {
            return false;
        }

        if (! is_numeric($expected)) {
            return false;
        }

        $actual = (float) $actual;
        $expected = (float) $expected;

        return match ($operator) {
            '=', '==' => $actual == $expected,
            '!=', '<>' => $actual != $expected,
            '>' => $actual > $expected,
            '>=' => $actual >= $expected,
            '<' => $actual < $expected,
            '<=' => $actual <= $expected,
            default => false,
        };
    }

    private function compareString(mixed $actual, mixed $expected, string $operator): bool
    {
        if ($operator === 'is_null') {
            return $actual === null || $actual === '';
        }

        if ($operator === 'is_not_null') {
            return $actual !== null && $actual !== '';
        }

        if ($expected === null || $expected === '') {
            return false;
        }

        $actual = is_array($actual) ? array_map(static fn ($item) => is_string($item) ? strtolower($item) : null, $actual) : $actual;

        if (is_array($actual)) {
            $actual = array_values(array_filter($actual, static fn ($item) => $item !== null));
        } elseif (is_string($actual)) {
            $actual = strtolower($actual);
        } else {
            $actual = $actual === null ? null : strtolower((string) $actual);
        }

        if (in_array($operator, ['in', 'not_in'], true)) {
            $expectedValues = Arr::wrap($expected);
            $normalizedExpected = array_values(array_filter(array_map(static function ($item) {
                return is_string($item) ? strtolower(trim($item)) : null;
            }, $expectedValues), static fn ($item) => $item !== null));

            if ($normalizedExpected === []) {
                return false;
            }

            if (is_array($actual)) {
                $found = ! empty(array_intersect($actual, $normalizedExpected));
            } elseif ($actual === null) {
                $found = false;
            } else {
                $found = in_array($actual, $normalizedExpected, true);
            }

            return $operator === 'in' ? $found : ! $found;
        }

        $expected = strtolower(is_array($expected) ? implode(',', $expected) : (string) $expected);

        return match ($operator) {
            '=', '==' => $actual === $expected,
            '!=', '<>' => $actual !== $expected,
            default => false,
        };
    }

    private function compareBoolean(mixed $actual, string $operator): bool
    {
        $value = filter_var($actual, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE);

        return match ($operator) {
            '=', '==', 'is_true' => $value === true,
            '!=', '<>', 'is_false' => $value === false,
            default => false,
        };
    }

    private function compareDateTime(mixed $actual, mixed $expected, string $operator): bool
    {
        if (in_array($operator, ['is_null', 'is_not_null'], true)) {
            $isNull = $actual === null;

            return $operator === 'is_null' ? $isNull : ! $isNull;
        }

        if ($actual === null) {
            return false;
        }

        if (! $actual instanceof CarbonImmutable) {
            if ($actual instanceof \DateTimeInterface) {
                $actual = CarbonImmutable::instance($actual);
            } else {
                return false;
            }
        }

        if (! is_string($expected) || trim($expected) === '') {
            return false;
        }

        try {
            $expectedDate = CarbonImmutable::parse($expected);
        } catch (\Throwable) {
            return false;
        }

        return match ($operator) {
            '=', '==' => $actual->equalTo($expectedDate),
            '!=', '<>' => ! $actual->equalTo($expectedDate),
            '>' => $actual->greaterThan($expectedDate),
            '>=' => $actual->greaterThanOrEqualTo($expectedDate),
            '<' => $actual->lessThan($expectedDate),
            '<=' => $actual->lessThanOrEqualTo($expectedDate),
            'before' => $actual->lessThan($expectedDate),
            'after' => $actual->greaterThan($expectedDate),
            'on_or_before' => $actual->lessThanOrEqualTo($expectedDate),
            'on_or_after' => $actual->greaterThanOrEqualTo($expectedDate),
            default => false,
        };
    }

    private function extractFieldValue(string $field, Customer $customer, ?CustomerMetric $metrics): mixed
    {
        return match ($field) {
            'orders_count' => $metrics?->orders_count ?? 0,
            'total_spent' => $metrics?->total_spent ?? 0,
            'total_spent_base', 'clv_base' => $metrics?->total_spent_base ?? 0,
            'average_order_value', 'aov' => $metrics?->average_order_value ?? 0,
            'average_order_value_base', 'aov_base' => $metrics?->average_order_value_base ?? 0,
            'first_order_at' => $metrics?->first_order_at ? CarbonImmutable::instance($metrics->first_order_at) : null,
            'last_order_at' => $metrics?->last_order_at ? CarbonImmutable::instance($metrics->last_order_at) : null,
            'first_order_days_ago' => $metrics?->first_order_at
                ? CarbonImmutable::now()->diffInDays(CarbonImmutable::instance($metrics->first_order_at))
                : null,
            'last_order_days_ago' => $metrics?->last_order_at
                ? CarbonImmutable::now()->diffInDays(CarbonImmutable::instance($metrics->last_order_at))
                : null,
            'provider' => $customer->shop?->provider,
            'shop_id' => $customer->shop_id,
            'customer_group' => $customer->customer_group,
            'is_vip' => $customer->is_vip,
            default => Arr::get($customer->data ?? [], $field),
        };
    }

    private function defaultFieldType(string $field): string
    {
        return match ($field) {
            'orders_count',
            'total_spent',
            'total_spent_base',
            'clv_base',
            'average_order_value',
            'average_order_value_base',
            'aov',
            'aov_base',
            'first_order_days_ago',
            'last_order_days_ago',
            'shop_id' => 'number',
            'first_order_at',
            'last_order_at' => 'datetime',
            'is_vip' => 'boolean',
            default => 'string',
        };
    }
}
