<?php

$defaultRates = [
    'EUR' => 24.5,
    'HUF' => 0.063,
    'HRK' => 3.25,
    'RON' => 4.8
];

$rates = json_decode(env('CURRENCY_RATES', ''), true);

if (! is_array($rates)) {
    $rates = [];
}

$rates = array_merge($defaultRates, $rates);

$normalizedRates = [];

foreach ($rates as $code => $rate) {
    if (! is_string($code)) {
        continue;
    }

    $upperCode = strtoupper($code);
    $normalizedRates[$upperCode] = (float) $rate;
}

$normalizedRates['CZK'] ??= 1.0;

return [
    'base' => strtoupper(env('CURRENCY_BASE', 'CZK')),
    'rates' => $normalizedRates,
];
