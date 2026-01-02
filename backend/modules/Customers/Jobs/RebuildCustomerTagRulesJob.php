<?php

namespace Modules\Customers\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Modules\Customers\Models\Customer;
use Modules\Customers\Services\CustomerTagRuleEngine;

class RebuildCustomerTagRulesJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;
    use \Modules\Core\Traits\WithJobLocking;

    public function __construct()
    {
        $this->queue = 'customers';
    }

    public function handle(CustomerTagRuleEngine $ruleEngine): void
    {
        // Acquire job lock to prevent concurrent execution
        if (!$this->acquireLock()) {
            \Illuminate\Support\Facades\Log::info('RebuildCustomerTagRulesJob is already running, skipping');
            return;
        }

        try {
        Customer::query()
            ->with(['metrics', 'shop:id,provider'])
            ->orderBy('created_at')
            ->chunk(200, function ($customers) use ($ruleEngine) {
                foreach ($customers as $customer) {
                    $ruleEngine->sync(
                        $customer,
                        $customer->relationLoaded('metrics') ? $customer->metrics : null
                    );
                }
            });
        } finally {
            $this->releaseLock();
        }
    }
}
