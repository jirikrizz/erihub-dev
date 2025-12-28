<?php

namespace Modules\Customers\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Modules\Customers\Models\Customer;
use Modules\Customers\Services\CustomerTagRuleEngine;

class ApplyCustomerTagRulesJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** @var list<string> */
    private array $customerGuids;

    public function __construct(array $customerGuids)
    {
        $this->customerGuids = array_values(array_filter($customerGuids, fn ($value) => is_string($value) && $value !== ''));
        $this->queue = 'customers_metrics';
    }

    public function handle(CustomerTagRuleEngine $ruleEngine): void
    {
        if ($this->customerGuids === []) {
            return;
        }

        Customer::query()
            ->whereIn('guid', $this->customerGuids)
            ->with(['metrics', 'shop:id,provider'])
            ->each(function (Customer $customer) use ($ruleEngine) {
                $ruleEngine->sync(
                    $customer,
                    $customer->relationLoaded('metrics') ? $customer->metrics : null
                );
            });
    }
}
