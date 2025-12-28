<?php

namespace Modules\Customers\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Arr;
use Modules\Customers\Models\Customer;
use Modules\Customers\Services\CustomerGroupService;
use Modules\Customers\Support\CustomerTagConfig;

class NormalizeCustomerGroups extends Command
{
    protected $signature = 'customers:normalize-groups {--chunk=500 : Počet zákazníků zpracovaných v jedné dávce} {--dry-run : Provede jen náhled bez uložení změn}';

    protected $description = 'Normalizuje zákaznické skupiny a štítky podle aktuální konfigurace.';

    public function __construct(private readonly CustomerGroupService $groupService)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $chunk = (int) $this->option('chunk');
        if ($chunk <= 0) {
            $chunk = 500;
        }

        $dryRun = (bool) $this->option('dry-run');
        $processed = 0;
        $updated = 0;

        $guestSignatures = $this->guestSignatures();

        Customer::query()
            ->orderBy('id')
            ->chunkById($chunk, function ($customers) use (&$processed, &$updated, $dryRun, $guestSignatures) {
                foreach ($customers as $customer) {
                    ++$processed;

                    $original = $customer->replicate();

                    $isGuest = $this->isGuestCandidate($customer, $guestSignatures);

                    $this->groupService->apply($customer, [
                        'is_guest' => $isGuest,
                        'billing_address' => $customer->billing_address ?? [],
                        'delivery_addresses' => $customer->delivery_addresses ?? [],
                        'source_group' => Arr::get($customer->data ?? [], 'customerGroup.name'),
                    ]);

                    if ($this->customersEqual($original, $customer)) {
                        continue;
                    }

                    if (! $dryRun) {
                        $customer->save();
                    }

                    ++$updated;
                }
            });

        $this->info(sprintf('Zpracováno %d zákazníků, aktualizováno %d.', $processed, $updated));

        if ($dryRun) {
            $this->warn('Dry-run režim: změny nebyly uloženy.');
        }

        return self::SUCCESS;
    }

    /**
     * @param  array<int, string>  $signatures
     */
    private function isGuestCandidate(Customer $customer, array $signatures): bool
    {
        $group = $this->normalize($customer->customer_group);

        if ($group !== null && in_array($group, $signatures, true)) {
            return true;
        }

        $tags = Arr::get($customer->data ?? [], 'tags', []);

        if (is_array($tags)) {
            foreach ($tags as $tag) {
                $normalized = $this->normalize($tag);
                if ($normalized !== null && in_array($normalized, $signatures, true)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * @return array<int, string>
     */
    private function guestSignatures(): array
    {
        $signatures = [$this->normalize(CustomerTagConfig::GUEST)];

        foreach ($this->groupService->aliases()[CustomerTagConfig::GUEST] ?? [] as $alias) {
            $normalized = $this->normalize($alias);
            if ($normalized !== null) {
                $signatures[] = $normalized;
            }
        }

        $label = $this->groupService->labels()[CustomerTagConfig::GUEST] ?? null;
        $normalizedLabel = $this->normalize($label);
        if ($normalizedLabel !== null) {
            $signatures[] = $normalizedLabel;
        }

        return array_values(array_unique(array_filter($signatures, fn ($value) => $value !== null)));
    }

    private function normalize(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $value = trim(mb_strtolower($value));

        return $value === '' ? null : $value;
    }

    private function customersEqual(Customer $original, Customer $current): bool
    {
        return $original->getAttributes() === $current->getAttributes();
    }
}
