<?php

namespace Modules\Inventory\Support;

class InventoryForecastProfile
{
    public const SETTINGS_KEY = 'inventory_forecast_profile';

    public static function defaults(): array
    {
        return [
            'seasonality' => 'moderate',
            'cashflow_strategy' => 'balanced',
            'growth_focus' => 'grow',
            'notes' => null,
        ];
    }

    public static function sanitize(?array $value): array
    {
        $defaults = self::defaults();

        if (! is_array($value)) {
            return $defaults;
        }

        $seasonality = $value['seasonality'] ?? $defaults['seasonality'];
        $cashflow = $value['cashflow_strategy'] ?? $defaults['cashflow_strategy'];
        $growth = $value['growth_focus'] ?? $defaults['growth_focus'];
        $notes = $value['notes'] ?? $defaults['notes'];

        $seasonalityOptions = ['none', 'moderate', 'peaks'];
        $cashflowOptions = ['conserve', 'balanced', 'invest'];
        $growthOptions = ['stabilize', 'grow', 'expand'];

        if (! in_array($seasonality, $seasonalityOptions, true)) {
            $seasonality = $defaults['seasonality'];
        }

        if (! in_array($cashflow, $cashflowOptions, true)) {
            $cashflow = $defaults['cashflow_strategy'];
        }

        if (! in_array($growth, $growthOptions, true)) {
            $growth = $defaults['growth_focus'];
        }

        $notes = is_string($notes) ? trim($notes) : null;
        if ($notes !== null && $notes !== '') {
            $notes = mb_substr($notes, 0, 1000);
        } else {
            $notes = null;
        }

        return [
            'seasonality' => $seasonality,
            'cashflow_strategy' => $cashflow,
            'growth_focus' => $growth,
            'notes' => $notes,
        ];
    }
}
