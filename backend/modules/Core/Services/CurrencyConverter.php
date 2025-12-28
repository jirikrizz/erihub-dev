<?php

namespace Modules\Core\Services;

class CurrencyConverter
{
    private string $baseCurrency;

    /**
     * @var array<string, float>
     */
    private array $rates;

    public function __construct(string $baseCurrency, array $rates = [])
    {
        $this->baseCurrency = strtoupper($baseCurrency);
        $this->rates = $this->normalizeRates($rates + [$this->baseCurrency => 1.0]);
    }

    public function getBaseCurrency(): string
    {
        return $this->baseCurrency;
    }

    public function convertToBase(?float $amount, ?string $fromCurrency): ?float
    {
        if ($amount === null) {
            return null;
        }

        $from = $this->normalizeCurrency($fromCurrency) ?? $this->baseCurrency;

        if ($from === $this->baseCurrency) {
            return $this->roundAmount($amount);
        }

        $rate = $this->rates[$from] ?? null;

        if ($rate === null || $rate <= 0) {
            return null;
        }

        return $this->roundAmount($amount * $rate);
    }

    public function convert(?float $amount, ?string $fromCurrency, ?string $toCurrency): ?float
    {
        if ($amount === null) {
            return null;
        }

        $from = $this->normalizeCurrency($fromCurrency) ?? $this->baseCurrency;
        $to = $this->normalizeCurrency($toCurrency) ?? $this->baseCurrency;

        if ($from === $to) {
            return $this->roundAmount($amount);
        }

        if ($from !== $this->baseCurrency) {
            $baseAmount = $this->convertToBase($amount, $from);
        } else {
            $baseAmount = $amount;
        }

        if ($baseAmount === null) {
            return null;
        }

        if ($to === $this->baseCurrency) {
            return $this->roundAmount($baseAmount);
        }

        $targetRate = $this->rates[$to] ?? null;

        if ($targetRate === null || $targetRate <= 0) {
            return null;
        }

        return $this->roundAmount($baseAmount / $targetRate);
    }

    public function normalizeCurrency(?string $currency): ?string
    {
        if (! $currency) {
            return null;
        }

        return strtoupper($currency);
    }

    /**
     * @param array<string, float|int|string> $rates
     * @return array<string, float>
     */
    private function normalizeRates(array $rates): array
    {
        $normalized = [];

        foreach ($rates as $code => $rate) {
            if (! is_string($code)) {
                continue;
            }

            $upper = strtoupper($code);
            $normalized[$upper] = (float) $rate;
        }

        $normalized[$this->baseCurrency] = 1.0;

        return $normalized;
    }

    private function roundAmount(float $amount): float
    {
        return round($amount, 2);
    }
}
