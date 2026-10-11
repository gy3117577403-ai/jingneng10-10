<?php
return [
    // Internal converter only. Its container has no originals, credentials or public port.
    'converter_url' => env('COMPANY_DATA_CONVERTER_URL', 'http://converter:3000'),
    // Network-free simulation must always be selected explicitly by the user.
    'assistant_demo' => env('COMPANY_DATA_ASSISTANT_DEMO', true),
];
