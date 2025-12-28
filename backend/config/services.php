<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'openai' => [
        'model' => env('OPENAI_MODEL', 'gpt-4o-mini'),
        'image_model' => env('OPENAI_IMAGE_MODEL', 'gpt-image-1'),
        'image_model_fallback' => env('OPENAI_IMAGE_MODEL_FALLBACK', 'dall-e-2'),
        'image_responses_model' => env('OPENAI_IMAGE_RESPONSES_MODEL'),
        'organization' => env('OPENAI_ORGANIZATION'),
        'video_model' => env('OPENAI_VIDEO_MODEL', 'sora-2'),
        'video_reference_model' => env('OPENAI_VIDEO_REFERENCE_MODEL', 'sora-2-pro'),
    ],

    'google_ai' => [
        'api_key' => env('GOOGLE_AI_API_KEY'),
        'image_model' => env('GOOGLE_AI_IMAGE_MODEL', 'imagen-3.0-generate-002'),
    ],

    'elogist' => [
        'wsdl' => env('ELOGIST_WSDL', base_path('ShipmallSoapAPI_v1.26.wsdl')),
        'location' => env('ELOGIST_LOCATION', 'https://elogist-demo.shipmall.cz/api/soap'),
        'login' => env('ELOGIST_LOGIN'),
        'password' => env('ELOGIST_PASSWORD'),
        'project_id' => env('ELOGIST_PROJECT_ID'),
        'throttle_sleep_ms' => (int) env('ELOGIST_THROTTLE_SLEEP_MS', 250),
    ],

];
