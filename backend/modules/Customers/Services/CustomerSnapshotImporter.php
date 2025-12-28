<?php

namespace Modules\Customers\Services;

use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\Customers\Models\Customer;
use Modules\Customers\Models\CustomerAccount;
use Modules\Shoptet\Models\Shop;

class CustomerSnapshotImporter
{
    public function __construct(private readonly CustomerGroupService $customerGroupService)
    {
    }

    public function import(array $payload, Shop $shop): void
    {
        $customerData = $payload['customer'] ?? $payload;
        $guid = $customerData['guid'] ?? null;
        if (! $guid) {
            return;
        }

        DB::transaction(function () use ($shop, $customerData, $guid) {
            $customer = Customer::query()->lockForUpdate()->firstOrNew([
                'guid' => $guid,
            ]);

            $currentShopId = $customer->shop_id;
            if ($currentShopId === null) {
                $customer->shop_id = $shop->id;
            } elseif ($currentShopId !== $shop->id) {
                $currentShopIsMaster = $customer->shop?->is_master;

                if ($currentShopIsMaster === null) {
                    $currentShopIsMaster = Shop::query()
                        ->whereKey($currentShopId)
                        ->value('is_master') ?? false;
                }

                if ($shop->is_master && ! $currentShopIsMaster) {
                    $customer->shop_id = $shop->id;
                }
            }

            $customer->full_name = Arr::get($customerData, 'billingAddress.fullName');
            $customer->billing_address = Arr::get($customerData, 'billingAddress');
            $customer->delivery_addresses = Arr::get($customerData, 'deliveryAddress', []);
            $customer->price_list = Arr::get($customerData, 'priceList.name');
            $customer->created_at_remote = Arr::get($customerData, 'creationTime');
            $customer->updated_at_remote = Arr::get($customerData, 'changeTime');
            $customer->data = $customerData;

            $mainAccount = collect($customerData['accounts'] ?? [])->firstWhere('mainAccount', true)
                ?? ($customerData['accounts'][0] ?? null);

            $customer->email = $mainAccount['email'] ?? $customer->email;
            $customer->phone = $mainAccount['phone'] ?? $customer->phone;

            $this->customerGroupService->apply($customer, [
                'source_group' => Arr::get($customerData, 'customerGroup.name'),
                'billing_address' => $customer->billing_address ?? [],
                'delivery_addresses' => $customer->delivery_addresses ?? [],
            ]);

            $customer->save();

            $this->syncAccounts($customer, $customerData['accounts'] ?? []);
        }, 3);
    }

    private function syncAccounts(Customer $customer, array $accounts): void
    {
        if ($accounts === []) {
            $customer->accounts()->delete();

            return;
        }

        $existingAccounts = $customer->accounts()->get()->keyBy('account_guid');
        $keptAccountIds = [];

        foreach ($accounts as $account) {
            if (! is_array($account)) {
                continue;
            }

            $guid = $this->resolveAccountGuid($account);

            $payload = [
                'account_guid' => $guid,
                'customer_id' => $customer->id,
                'email' => $this->sanitizeScalar($account['email'] ?? null),
                'phone' => $this->sanitizeScalar($account['phone'] ?? null),
                'main_account' => (bool) ($account['mainAccount'] ?? false),
                'authorized' => (bool) ($account['authorized'] ?? false),
                'email_verified' => (bool) ($account['emailVerified'] ?? false),
                'data' => $this->encodePayload($account),
            ];

            $existing = $existingAccounts->get($guid);

            if ($existing) {
                $existing->fill($payload);
                if ($existing->isDirty()) {
                    $existing->save();
                } else {
                    $existing->touch();
                }
                $keptAccountIds[] = $existing->id;
                continue;
            }

            $created = $customer->accounts()->create(array_merge($payload, [
                'id' => (string) Str::uuid(),
            ]));

            $keptAccountIds[] = $created->id;
        }

        $customer->accounts()
            ->when($keptAccountIds !== [], function ($query) use ($keptAccountIds) {
                $query->whereNotIn('id', $keptAccountIds);
            })
            ->delete();
    }

    private function sanitizeScalar(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        if (is_string($value) || is_int($value) || is_float($value)) {
            return (string) $value;
        }

        if (is_bool($value)) {
            return $value ? '1' : '0';
        }

        return null;
    }

    private function encodePayload(array $payload): string
    {
        $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        if ($encoded === false) {
            return serialize($payload);
        }

        return $encoded;
    }

    private function resolveAccountGuid(array $account): string
    {
        $raw = $this->sanitizeScalar($account['guid'] ?? null);
        if ($raw) {
            return $raw;
        }

        $email = $this->sanitizeScalar($account['email'] ?? null);
        $phone = $this->sanitizeScalar($account['phone'] ?? null);

        if ($email || $phone) {
            return sha1(($email ?? '').'|'.($phone ?? ''));
        }

        return (string) Str::uuid();
    }
}
