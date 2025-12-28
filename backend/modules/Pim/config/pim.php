<?php

return [
    'locales' => [
        'cs_CZ',
        'sk_SK',
        'hu_HU',
        'ro_RO',
        'de_DE',
        'hr_HR',
        'en_GB',
    ],
    'default_base_locale' => 'cs_CZ',
    'workflow' => [
        'states' => ['draft', 'in_review', 'approved', 'synced'],
        'transitions' => [
            'submit' => ['from' => 'draft', 'to' => 'in_review'],
            'approve' => ['from' => 'in_review', 'to' => 'approved'],
            'reject' => ['from' => 'in_review', 'to' => 'draft'],
            'sync' => ['from' => 'approved', 'to' => 'synced'],
        ],
    ],
];
