<?php

namespace Modules\Customers\Console\Commands;

use Illuminate\Console\Command;
use Modules\Customers\Jobs\RebuildCustomerTagRulesJob;
use Modules\Customers\Services\CustomerTagRuleEngine;

class ApplyCustomerTagRules extends Command
{
    protected $signature = 'customers:apply-tag-rules
        {--queue=customers : Název fronty, do které se má úloha zařadit}
        {--sync : Provede přepočet synchronně v aktuálním procesu}';

    protected $description = 'Znovu vyhodnotí pravidla pro štítky zákazníků pro všechny záznamy.';

    public function handle(CustomerTagRuleEngine $ruleEngine): int
    {
        if ($this->option('sync')) {
            $this->info('Spouštím synchronní přepočet všech pravidel štítků...');
            (new RebuildCustomerTagRulesJob())->handle($ruleEngine);
            $this->info('Přepočet dokončen.');

            return self::SUCCESS;
        }

        $queue = (string) $this->option('queue') ?: 'customers';
        RebuildCustomerTagRulesJob::dispatch()->onQueue($queue);
        $this->info(sprintf('Úloha na přepočet pravidel byla zařazena do fronty "%s".', $queue));

        return self::SUCCESS;
    }
}
