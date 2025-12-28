<?php

namespace Modules\Customers\Services;

use Illuminate\Support\Collection;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\Core\Services\SettingsService;
use Modules\Customers\Models\Customer;
use Modules\Customers\Models\CustomerAccount;
use Modules\Orders\Models\Order;

class OrderCustomerBackfillService
{
    /** @var array<string, array<int, Customer|null>> */
    protected array $customerCache = [];

    /** @var array<string, array<int, Customer|null>> */
    protected array $customerPhoneCache = [];

    /** @var array<string, int> */
    protected array $stats = [
        'orders_attached' => 0,
        'customers_created' => 0,
        'customers_updated' => 0,
        'accounts_created' => 0,
        'orders_skipped_no_email' => 0,
    ];

    private ?array $customerSettings = null;

    public function __construct(
        private readonly SettingsService $settingsService,
        private readonly CustomerGroupService $customerGroupService,
        private readonly CustomerTagRuleEngine $customerTagRuleEngine
    )
    {
    }

    public function process(Collection $orders, bool $dryRun = false): array
    {
        $groups = [];

        foreach ($orders as $order) {
            if (! $order instanceof Order) {
                continue;
            }

            $order->loadMissing('shop');

            $normalizedEmail = $this->normalizeEmail($this->extractEmail($order));
            $normalizedPhone = $this->normalizePhone($this->extractPhone($order));

            if (! $normalizedEmail && ! $normalizedPhone) {
                $this->stats['orders_skipped_no_email']++;
                continue;
            }

            $keyPrefix = $normalizedEmail ? 'email:' : 'phone:';
            $keyValue = $normalizedEmail ?? $normalizedPhone;
            $groupKey = $keyPrefix.$keyValue;

            if (! isset($groups[$groupKey])) {
                $groups[$groupKey] = [
                    'orders' => [],
                    'normalized_email' => $normalizedEmail,
                    'normalized_phone' => $normalizedPhone,
                ];
            }

            $groups[$groupKey]['orders'][] = $order;
            if (! $groups[$groupKey]['normalized_email'] && $normalizedEmail) {
                $groups[$groupKey]['normalized_email'] = $normalizedEmail;
            }
            if (! $groups[$groupKey]['normalized_phone'] && $normalizedPhone) {
                $groups[$groupKey]['normalized_phone'] = $normalizedPhone;
            }
        }

        foreach ($groups as $group) {
            $ordersForGroup = collect($group['orders']);
            if ($ordersForGroup->isEmpty()) {
                continue;
            }

            /** @var Order $representative */
            $representative = $ordersForGroup->first();

            $preferredShopId = $this->resolvePreferredShopId($representative);
            $normalizedEmail = $group['normalized_email'] ?? null;
            $normalizedPhone = $group['normalized_phone'] ?? null;
            $hasRepresentativeGuid = ! empty($representative->customer_guid);

            $customer = $this->findExistingCustomer($normalizedEmail, $normalizedPhone, $preferredShopId);

            if (! $customer) {
                $customer = $this->createCustomerFromOrder(
                    $representative,
                    $normalizedEmail,
                    $normalizedPhone,
                    $dryRun,
                    $preferredShopId
                );

                if (! $customer) {
                    continue;
                }

                $this->stats['customers_created']++;
            } else {
                if ($this->enrichCustomerFromOrder($customer, $representative, $dryRun)) {
                    $this->stats['customers_updated']++;
                }
                $normalizedCustomerEmail = $this->normalizeEmail(
                    $customer->email
                        ?? $normalizedEmail
                        ?? $this->extractEmail($representative)
                );
                if ($normalizedCustomerEmail && ($hasRepresentativeGuid || $this->shouldRegisterGuests())) {
                    $this->ensureAccountExists($customer, $normalizedCustomerEmail, $customer->phone, $dryRun);
                }
            }

            $orderIds = $ordersForGroup->pluck('id')->all();
            $resolvedEmail = $customer->email
                ?? $representative->customer_email
                ?? $this->extractEmail($representative);
            $resolvedPhone = $customer->phone
                ?? $representative->customer_phone
                ?? $this->extractPhone($representative);

            $this->cacheCustomerRecords(
                $customer,
                $this->normalizeEmail($customer->email ?? $normalizedEmail),
                $customer->normalized_phone ?? $this->normalizePhone($customer->phone ?? $normalizedPhone),
                $preferredShopId
            );

            if (! $dryRun) {
                Order::query()
                    ->whereIn('id', $orderIds)
                    ->update([
                        'customer_guid' => $customer->guid,
                        'customer_email' => $resolvedEmail,
                        'customer_phone' => $resolvedPhone,
                    ]);
            }

            $this->stats['orders_attached'] += count($orderIds);
        }

        return $this->stats;
    }

    public function attachCustomerFromOrder(Order $order): void
    {
        if ($order->customer_guid) {
            $exists = Customer::query()
                ->where('guid', $order->customer_guid)
                ->exists();

            if ($exists) {
                return;
            }
        }

        $this->process(collect([$order]));
    }

    public function syncCustomerFromOrder(Order $order): void
    {
        if (! $order->customer_guid) {
            $this->attachCustomerFromOrder($order);

            return;
        }

        $customer = Customer::query()->where('guid', $order->customer_guid)->first();

        if (! $customer) {
            $this->attachCustomerFromOrder($order);

            return;
        }

        $updated = $this->enrichCustomerFromOrder($customer, $order, false, assignNoregTag: false);

        if ($updated) {
            $customer->refresh();
        }

        $normalizedEmail = $this->normalizeEmail($customer->email ?? $this->extractEmail($order));

        if ($normalizedEmail && ($order->customer_guid || $this->shouldRegisterGuests())) {
            $this->ensureAccountExists($customer, $normalizedEmail, $customer->phone, false);
        }
    }

    /**
     * @return array<string, int>
     */
    public function getStats(): array
    {
        return $this->stats;
    }

    protected function normalizeEmail(?string $email): ?string
    {
        if ($email === null) {
            return null;
        }

        $normalized = trim(mb_strtolower($email));

        return $normalized !== '' ? $normalized : null;
    }

    protected function findCustomerByEmail(string $normalizedEmail, int $preferredShopId): ?Customer
    {
        if (! isset($this->customerCache[$normalizedEmail][$preferredShopId])) {
            $customer = Customer::query()
                ->whereRaw('LOWER(email) = ?', [$normalizedEmail])
                ->orderByRaw('CASE WHEN shop_id = ? THEN 0 ELSE 1 END', [$preferredShopId])
                ->first();

            $this->customerCache[$normalizedEmail][$preferredShopId] = $customer;
        }

        return $this->customerCache[$normalizedEmail][$preferredShopId];
    }

    protected function createCustomerFromOrder(
        Order $order,
        ?string $normalizedEmail,
        ?string $normalizedPhone,
        bool $dryRun,
        int $preferredShopId
    ): ?Customer
    {
        $hasShoptetGuid = ! empty($order->customer_guid);

        if (! $hasShoptetGuid && ! $this->shouldCreateGuests()) {
            return null;
        }
        $email = $this->extractEmail($order) ?? $normalizedEmail;
        $fullName = $this->extractFullName($order);
        $phone = $this->extractPhone($order) ?? $normalizedPhone;
        $billingAddress = $this->extractBillingAddress($order);
        $deliveryAddress = $this->extractDeliveryAddress($order);

        $customer = new Customer();
        $customer->guid = $order->customer_guid ?: (string) Str::uuid();
        $customer->shop_id = $preferredShopId;
        $customer->email = $email;
        $customer->full_name = $fullName;
        $customer->phone = $phone;
        $customer->normalized_phone = $this->normalizePhone($phone);
        $customer->billing_address = $billingAddress;
        $customer->delivery_addresses = $deliveryAddress ? [$deliveryAddress] : [];
        $customer->data = $this->buildInitialData($order);
        if (! $hasShoptetGuid && ! $customer->customer_group) {
            $customer->customer_group = 'Neregistrovaný';
        }

        if ($dryRun) {
            $this->cacheCustomerRecords(
                $customer,
                $normalizedEmail,
                $customer->normalized_phone,
                $preferredShopId
            );

            return $customer;
        }

        $this->customerGroupService->apply($customer, [
            'is_guest' => ! $hasShoptetGuid,
            'billing_address' => $customer->billing_address ?? [],
            'delivery_addresses' => $customer->delivery_addresses ?? [],
            'source_group' => Arr::get($order->data ?? [], 'customer.customerGroup.name'),
        ]);

        $this->customerTagRuleEngine->sync($customer, null, false);

        DB::transaction(function () use ($customer, $normalizedEmail, $preferredShopId, $phone, $hasShoptetGuid) {
            $customer->save();
            $normalizedCustomerEmail = $this->normalizeEmail($customer->email ?? $normalizedEmail);
            if ($normalizedCustomerEmail && ($hasShoptetGuid || $this->shouldRegisterGuests())) {
                $this->ensureAccountExists($customer, $normalizedCustomerEmail, $phone, false);
            }
            $this->cacheCustomerRecords(
                $customer,
                $normalizedCustomerEmail,
                $customer->normalized_phone,
                $preferredShopId
            );
        });

        return $customer->refresh();
    }

    public function enrichCustomerFromOrder(Customer $customer, Order $order, bool $dryRun, bool $assignNoregTag = true): bool
    {
        $original = $customer->replicate();
        $hasShoptetGuid = ! empty($order->customer_guid);

        $orderName = $this->extractFullName($order);
        if ($this->shouldReplaceValue($orderName, $customer->full_name)) {
            $customer->full_name = $orderName;
        }

        $orderPhone = $this->extractPhone($order);
        if ($this->shouldReplaceValue($orderPhone, $customer->phone)) {
            $customer->phone = $orderPhone;
        }

        $orderEmail = $this->extractEmail($order);
        if ($this->shouldReplaceValue($orderEmail, $customer->email)) {
            $customer->email = $orderEmail;
        }

        $customer->normalized_phone = $this->normalizePhone($customer->phone);

        $billingAddress = $this->extractBillingAddress($order);
        if ($billingAddress) {
            $customer->billing_address = $this->mergeAddresses($customer->billing_address, $billingAddress);
        }

        $deliveryAddress = $this->extractDeliveryAddress($order);
        if ($deliveryAddress) {
            $addresses = collect($customer->delivery_addresses ?? [])
                ->filter(fn ($addr) => is_array($addr))
                ->push($deliveryAddress)
                ->unique(fn ($addr) => json_encode($addr))
                ->values()
                ->all();

            $customer->delivery_addresses = $addresses;
        }

        $this->customerGroupService->apply($customer, [
            'is_guest' => empty($order->customer_guid),
            'billing_address' => $customer->billing_address ?? [],
            'delivery_addresses' => $customer->delivery_addresses ?? [],
            'source_group' => Arr::get($order->data ?? [], 'customer.customerGroup.name'),
        ]);

        $this->customerTagRuleEngine->sync($customer, null, false);

        $normalizedEmail = $this->normalizeEmail($customer->email ?? $this->extractEmail($order));
        if ($normalizedEmail && ($hasShoptetGuid || $this->shouldRegisterGuests())) {
            $this->ensureAccountExists($customer, $normalizedEmail, $customer->phone, $dryRun);
        }

        if ($dryRun) {
            return ! $this->customersEqual($original, $customer);
        }

        if ($this->customersEqual($original, $customer)) {
            return false;
        }

        $customer->save();

        return true;
    }

    protected function ensureAccountExists(Customer $customer, string $normalizedEmail, ?string $phone, bool $dryRun = false): void
    {
        if ($normalizedEmail === '') {
            return;
        }

        $exists = $customer->relationLoaded('accounts')
            ? $customer->accounts->contains(fn (CustomerAccount $account) => $this->normalizeEmail($account->email) === $normalizedEmail)
            : $customer->accounts()->whereRaw('LOWER(email) = ?', [$normalizedEmail])->exists();

        if ($exists) {
            return;
        }

        if ($dryRun) {
            return;
        }

        $customer->accounts()->create([
            'account_guid' => (string) Str::uuid(),
            'email' => $customer->email,
            'phone' => $phone,
            'main_account' => true,
            'authorized' => false,
            'email_verified' => false,
            'data' => ['source' => 'orders-backfill'],
        ]);

        $this->stats['accounts_created']++;
    }

    protected function buildInitialData(Order $order): array
    {
        return [
            'created_from_order_id' => $order->id,
            'created_from_order_code' => $order->code,
            'source' => 'orders-backfill',
        ];
    }

    protected function extractFullName(Order $order): ?string
    {
        $name = $order->customer_name
            ?? Arr::get($order->billing_address, 'fullName')
            ?? Arr::get($order->delivery_address, 'fullName');

        if ($name) {
            return trim($name);
        }

        $first = Arr::get($order->billing_address, 'firstName')
            ?? Arr::get($order->delivery_address, 'firstName');
        $last = Arr::get($order->billing_address, 'lastName')
            ?? Arr::get($order->delivery_address, 'lastName');

        $composed = trim(trim((string) $first).' '.trim((string) $last));

        return $composed !== '' ? $composed : null;
    }

    protected function extractPhone(Order $order): ?string
    {
        $phone = $order->customer_phone
            ?? Arr::get($order->billing_address, 'phone')
            ?? Arr::get($order->delivery_address, 'phone');

        if (! $phone) {
            return null;
        }

        $trimmed = trim((string) $phone);

        return $trimmed !== '' ? $trimmed : null;
    }

    protected function extractBillingAddress(Order $order): ?array
    {
        $billing = $order->billing_address;

        return is_array($billing) && $billing !== [] ? $billing : null;
    }

    protected function extractDeliveryAddress(Order $order): ?array
    {
        $delivery = $order->delivery_address;

        return is_array($delivery) && $delivery !== [] ? $delivery : null;
    }

    protected function extractEmail(Order $order): ?string
    {
        $candidates = [
            $order->customer_email,
            Arr::get($order->billing_address, 'email'),
            Arr::get($order->delivery_address, 'email'),
        ];

        foreach ($candidates as $candidate) {
            if (! $candidate) {
                continue;
            }

            $trimmed = trim((string) $candidate);

            if ($trimmed !== '') {
                return $trimmed;
            }
        }

        return null;
    }

    protected function normalizePhone(?string $phone): ?string
    {
        if ($phone === null) {
            return null;
        }

        $trimmed = trim((string) $phone);

        if ($trimmed === '') {
            return null;
        }

        $hasPlus = str_starts_with($trimmed, '+');
        $digits = preg_replace('/\D+/', '', $trimmed);

        if ($digits === null || $digits === '') {
            return null;
        }

        return $hasPlus ? '+'.$digits : $digits;
    }

    protected function resolvePreferredShopId(Order $order): int
    {
        $order->loadMissing('shop');

        $linked = $order->shop?->customer_link_shop_id;

        if ($linked) {
            return (int) $linked;
        }

        return (int) $order->shop_id;
    }

    protected function findExistingCustomer(?string $normalizedEmail, ?string $normalizedPhone, int $preferredShopId): ?Customer
    {
        if ($normalizedEmail) {
            $customer = $this->findCustomerByEmail($normalizedEmail, $preferredShopId);
            if ($customer) {
                return $customer;
            }
        }

        if ($normalizedPhone) {
            $customer = $this->findCustomerByPhone($normalizedPhone, $preferredShopId);
            if ($customer) {
                return $customer;
            }
        }

        return null;
    }

    protected function findCustomerByPhone(string $normalizedPhone, int $preferredShopId): ?Customer
    {
        if (! isset($this->customerPhoneCache[$normalizedPhone][$preferredShopId])) {
            $customer = Customer::query()
                ->whereNotNull('normalized_phone')
                ->where('normalized_phone', $normalizedPhone)
                ->orderByRaw('CASE WHEN shop_id = ? THEN 0 ELSE 1 END', [$preferredShopId])
                ->first();

            $this->customerPhoneCache[$normalizedPhone][$preferredShopId] = $customer;
        }

        return $this->customerPhoneCache[$normalizedPhone][$preferredShopId];
    }

    protected function cacheCustomerRecords(
        Customer $customer,
        ?string $normalizedEmail,
        ?string $normalizedPhone,
        int $shopId
    ): void {
        if ($normalizedEmail) {
            $this->customerCache[$normalizedEmail][$shopId] = $customer;
        }

        if ($normalizedPhone) {
            $this->customerPhoneCache[$normalizedPhone][$shopId] = $customer;
        }
    }

    protected function customersEqual(Customer $original, Customer $current): bool
    {
        return $original->getAttributes() == $current->getAttributes();
    }

    private function shouldReplaceValue(?string $candidate, ?string $current): bool
    {
        $candidate = trim((string) $candidate);
        $current = trim((string) $current);

        if ($candidate === '') {
            return false;
        }

        if ($current === '') {
            return true;
        }

        return mb_strlen($candidate) > mb_strlen($current) || $candidate !== $current;
    }

    private function mergeAddresses(?array $current, array $incoming): array
    {
        $current = $current ?? [];

        foreach ($incoming as $key => $value) {
            if ($value === null || $value === '') {
                continue;
            }

            if (! isset($current[$key]) || $current[$key] === null || $current[$key] === '') {
                $current[$key] = $value;
                continue;
            }

            if (is_string($current[$key]) && is_string($value) && mb_strlen($value) > mb_strlen($current[$key])) {
                $current[$key] = $value;
            }
        }

        return $current;
    }

    private function shouldCreateGuests(): bool
    {
        return (bool) ($this->customerSettings()['auto_create_guest'] ?? true);
    }

    private function shouldRegisterGuests(): bool
    {
        return (bool) ($this->customerSettings()['auto_register_guest'] ?? false);
    }

    private function customerSettings(): array
    {
        if ($this->customerSettings === null) {
            $defaults = [
                'auto_create_guest' => true,
                'auto_register_guest' => false,
            ];

            $this->customerSettings = array_replace(
                $defaults,
                $this->settingsService->getJson('customers_settings', $defaults)
            );
        }

        return $this->customerSettings;
    }
}
