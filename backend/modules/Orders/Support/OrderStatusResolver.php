<?php

namespace Modules\Orders\Support;

use Illuminate\Database\Eloquent\Builder;
use Modules\Core\Services\SettingsService;

class OrderStatusResolver
{
    private const SETTINGS_KEY = 'orders_status_mapping';

    private ?array $cache = null;

    public function __construct(private readonly SettingsService $settings)
    {
    }

    /**
     * @return array{completed: array, returned: array, complaint: array, cancelled: array}
     */
    public function mapping(): array
    {
        if ($this->cache !== null) {
            return $this->cache;
        }

        $defaults = [
            'completed' => [],
            'returned' => [],
            'complaint' => [],
            'cancelled' => [],
        ];

        $data = $this->settings->getJson(self::SETTINGS_KEY, $defaults);

        $this->cache = [
            'completed' => $this->normalise($data['completed'] ?? []),
            'returned' => $this->normalise($data['returned'] ?? []),
            'complaint' => $this->normalise($data['complaint'] ?? []),
            'cancelled' => $this->normalise($data['cancelled'] ?? []),
        ];

        return $this->cache;
    }

    /**
     * @return list<string>
     */
    public function completed(): array
    {
        return $this->mapping()['completed'];
    }

    /**
     * @return list<string>
     */
    public function returned(): array
    {
        return $this->mapping()['returned'];
    }

    /**
     * @return list<string>
     */
    public function complaint(): array
    {
        return $this->mapping()['complaint'];
    }

    /**
     * @return list<string>
     */
    public function cancelled(): array
    {
        return $this->mapping()['cancelled'];
    }

    /**
     * @return list<string>
     */
    public function excludedFromCompleted(): array
    {
        return array_values(array_unique(array_merge(
            $this->returned(),
            $this->complaint(),
            $this->cancelled()
        )));
    }

    public function applyCompletedFilter(Builder $builder, string $column = 'status'): Builder
    {
        $completed = $this->completed();

        if ($completed !== []) {
            $builder->whereIn($column, $completed);

            return $builder;
        }

        $excluded = $this->excludedFromCompleted();

        if ($excluded !== []) {
            $builder->whereNotIn($column, $excluded);
        }

        return $builder;
    }

    /**
     * @param list<string> $values
     * @return list<string>
     */
    private function normalise(array $values): array
    {
        return array_values(
            array_filter(
                array_unique(
                    array_map(function ($value) {
                        if (! is_string($value)) {
                            return null;
                        }

                        $trimmed = trim($value);

                        return $trimmed === '' ? null : $trimmed;
                    }, $values)
                ),
                static fn ($value) => $value !== null
            )
        );
    }
}
