<?php

return [
    'base_uri' => env('SHOPTET_API_BASE_URI', 'https://api.myshoptet.com'),
    'oauth_token_url' => env('SHOPTET_OAUTH_TOKEN_URL'),
    'client_id' => env('SHOPTET_CLIENT_ID'),
    'client_secret' => env('SHOPTET_CLIENT_SECRET'),
    'timeout' => env('SHOPTET_TIMEOUT', 30),
    'download_timeout' => env('SHOPTET_DOWNLOAD_TIMEOUT', 600),
    'default_pricelist_id' => env('SHOPTET_DEFAULT_PRICELIST_ID', 1),
    'retry' => [
        'times' => env('SHOPTET_RETRY_TIMES', 3),
        'sleep' => env('SHOPTET_RETRY_SLEEP', 200),
    ],
];
