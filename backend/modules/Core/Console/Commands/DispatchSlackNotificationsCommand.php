<?php

namespace Modules\Core\Console\Commands;

use Illuminate\Console\Command;
use Modules\Core\Services\SlackNotificationDispatcher;

class DispatchSlackNotificationsCommand extends Command
{
    protected $signature = 'notifications:dispatch-slack';

    protected $description = 'Odešle připravené notifikace do Slacku.';

    public function __construct(private readonly SlackNotificationDispatcher $dispatcher)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $count = $this->dispatcher->dispatch();

        $this->info(sprintf('Odesláno %d Slack notifikací.', $count));

        return self::SUCCESS;
    }
}
