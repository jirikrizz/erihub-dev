<?php

namespace Modules\Customers\Services;

use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use Modules\Core\Services\SettingsService;
use Modules\Customers\Models\Customer;
use Modules\Customers\Support\CustomerTagConfig;

class CustomerGroupService
{
    private const FORBIDDEN_TAG_SIGNATURES = ['blbečci', 'blbecci'];

    private ?array $configCache = null;

    public function __construct(private readonly SettingsService $settings)
    {
    }

    /**
     * @return array{
     *   labels: array<string, string>,
     *   aliases: array<string, array<int, string>>
     * }
     */
    private function config(): array
    {
        if ($this->configCache === null) {
            $raw = $this->settings->getJson('customers_settings', []);

            $labels = CustomerTagConfig::sanitizeLabels(Arr::get($raw, 'group_labels', []));
            $aliases = CustomerTagConfig::sanitizeAliases(Arr::get($raw, 'group_aliases', []));

            $this->configCache = [
                'labels' => $labels,
                'aliases' => $aliases,
            ];
        }

        return $this->configCache;
    }

    public function refresh(): void
    {
        $this->configCache = null;
    }

    /**
     * @return array<string, string>
     */
    public function labels(): array
    {
        return $this->config()['labels'];
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function aliases(): array
    {
        return $this->config()['aliases'];
    }

    public function labelFor(string $groupKey): string
    {
        $labels = $this->labels();

        return $labels[$groupKey] ?? $labels[CustomerTagConfig::REGISTERED];
    }

    /**
     * Determine canonical group key.
     *
     * @param  array<string, mixed>  $context
     */
    public function canonical(?string $sourceGroup, array $context = []): string
    {
        if ($matched = $this->matchAlias($sourceGroup)) {
            return $matched;
        }

        if (! empty($context['force_company'])) {
            return CustomerTagConfig::COMPANY;
        }

        $isCompany = $context['is_company'] ?? null;

        if ($isCompany === null) {
            $companyCandidates = [];

            $billing = $context['billing_address'] ?? [];
            if (is_array($billing)) {
                $companyCandidates[] = Arr::get($billing, 'company');
            }

            $deliveries = $context['delivery_addresses'] ?? [];
            if (is_array($deliveries)) {
                foreach ($deliveries as $address) {
                    if (is_array($address)) {
                        $companyCandidates[] = Arr::get($address, 'company');
                    }
                }
            }

            $companyCandidates[] = $context['company_name'] ?? null;
            $companyCandidates[] = $context['vat_id'] ?? null;

            foreach ($companyCandidates as $candidate) {
                if (is_string($candidate) && trim($candidate) !== '') {
                    $isCompany = true;
                    break;
                }
            }
        }

        if ($isCompany) {
            return CustomerTagConfig::COMPANY;
        }

        if (! empty($context['is_guest'])) {
            return CustomerTagConfig::GUEST;
        }

        return CustomerTagConfig::REGISTERED;
    }

    /**
     * @param  array<string, mixed>  $context
     */
    public function apply(Customer $customer, array $context = []): void
    {
        $groupKey = $this->canonical(
            $context['source_group'] ?? $customer->customer_group ?? null,
            array_merge([
                'billing_address' => $customer->billing_address ?? [],
                'delivery_addresses' => $customer->delivery_addresses ?? [],
                'company_name' => Arr::get($customer->billing_address ?? [], 'company'),
                'vat_id' => Arr::get($customer->data ?? [], 'vat_id'),
            ], $context)
        );

        $customer->customer_group = $groupKey;
        $customer->data = $this->buildDataWithTags($customer, $groupKey, $context);
    }

    public function refreshTagData(Customer $customer): void
    {
        $groupKey = $customer->customer_group ?? CustomerTagConfig::REGISTERED;
        $customer->data = $this->buildDataWithTags($customer, $groupKey);
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function buildDataWithTags(Customer $customer, string $groupKey, array $context = []): array
    {
        $labels = $this->labels();
        $data = $customer->data ?? [];
        $autoTags = $this->sanitizeAutoTags(Arr::get($data, 'auto_tags', []));
        $data['auto_tags'] = $autoTags;

        $existing = collect(Arr::get($data, 'tags', []))
            ->filter(fn ($tag) => is_string($tag) && trim($tag) !== '')
            ->map(fn ($tag) => trim($tag));

        $standardSignatures = $this->standardLabelSet();

        $autoSignatures = collect($autoTags)
            ->pluck('label')
            ->filter(fn ($label) => is_string($label) && $label !== '')
            ->map(fn ($label) => $this->normalize($label))
            ->filter(fn ($label) => $label !== null)
            ->values()
            ->all();

        $custom = $existing->reject(function ($tag) use ($standardSignatures, $autoSignatures) {
            $normalized = $this->normalize($tag);

            if ($normalized === null) {
                return false;
            }

            if (in_array($normalized, $standardSignatures, true)) {
                return true;
            }

            return in_array($normalized, $autoSignatures, true);
        })->reject(fn ($tag) => $this->isForbiddenTag($tag));

        $tags = collect();
        $tags->push($labels[$groupKey] ?? $labels[CustomerTagConfig::REGISTERED]);

        if ($customer->is_vip) {
            $tags->push($labels[CustomerTagConfig::VIP]);
        }

        foreach ($autoTags as $autoTag) {
            $label = $autoTag['label'] ?? null;
            if (is_string($label) && trim($label) !== '') {
                $tags->push(trim($label));
            }
        }

        $data['tags'] = $tags->merge($custom)->unique()->values()->all();

        return $data;
    }

    private function matchAlias(?string $value): ?string
    {
        $normalized = $this->normalize($value);

        if ($normalized === null) {
            return null;
        }

        foreach ($this->aliases() as $group => $entries) {
            if (in_array($normalized, $entries, true)) {
                return $group;
            }
        }

        return null;
    }

    private function normalize(?string $value): ?string
    {
        if ($value === null) {
            return null;
	}

        $value = trim(mb_strtolower($value));

        return $value === '' ? null : $value;
    }

    /**
     * @return array<int, string>
     */
    private function standardLabelSet(): array
    {
        $labels = array_map(
            fn ($label) => $this->normalize($label),
            $this->labels()
        );

        $aliases = array_reduce(
            $this->aliases(),
            fn (array $carry, array $items) => array_merge($carry, $items),
            []
        );

        $normalizedAliases = array_map(fn ($value) => $this->normalize($value), $aliases);

        return array_values(array_unique(array_filter(array_merge(
            array_filter($labels, fn ($value) => $value !== null),
            array_filter($normalizedAliases, fn ($value) => $value !== null)
        ))));
    }

    /**
     * @param  mixed  $value
     * @return array<int, array{key: string, label: string, color: string, source_rule_id: ?string, source_rule_name: ?string}>
     */
    private function sanitizeAutoTags(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $sanitized = [];

        foreach ($value as $entry) {
            if (! is_array($entry)) {
                continue;
            }

            $label = isset($entry['label']) ? trim((string) $entry['label']) : '';
            if ($label === '') {
                continue;
            }

            if ($this->isForbiddenTag($label)) {
                continue;
            }

            $key = isset($entry['key']) && (string) $entry['key'] !== ''
                ? (string) $entry['key']
                : Str::slug(mb_strtolower($label));

            $sanitized[$key] = [
                'key' => $key,
                'label' => $label,
                'color' => isset($entry['color']) && (string) $entry['color'] !== '' ? (string) $entry['color'] : 'gray',
                'source_rule_id' => isset($entry['source_rule_id']) && (string) $entry['source_rule_id'] !== '' ? (string) $entry['source_rule_id'] : null,
                'source_rule_name' => isset($entry['source_rule_name']) && (string) $entry['source_rule_name'] !== '' ? (string) $entry['source_rule_name'] : null,
            ];
        }

        return array_values($sanitized);
    }

    private function isForbiddenTag(?string $value): bool
    {
        $normalized = $this->normalize($value);

        if ($normalized === null) {
            return false;
        }

        return in_array($normalized, self::FORBIDDEN_TAG_SIGNATURES, true);
    }
}
