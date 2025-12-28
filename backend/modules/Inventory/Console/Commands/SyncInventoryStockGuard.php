<?php

namespace Modules\Inventory\Console\Commands;

use Illuminate\Console\Command;
use Modules\Inventory\Services\InventoryStockGuardSyncService;

class SyncInventoryStockGuard extends Command
{
    protected $signature = 'inventory:stock-guard:sync {--chunk=200 : Počet variant zpracovaných v jednom kroku}';

    protected $description = 'Synchronizuje data pro Hlídače skladu a uloží je do cache tabulky.';

    public function __construct(private readonly InventoryStockGuardSyncService $syncService)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $chunk = (int) $this->option('chunk');

        $this->info('Spouštím synchronizaci Hlídače skladu...');

        $result = $this->syncService->sync($chunk);

        $this->info(sprintf('Hotovo. Synchronizováno %d variant.', $result['processed'] ?? 0));

        return self::SUCCESS;
    }
}
