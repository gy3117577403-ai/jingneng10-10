<?php
return [
    // Internal converter only. Its container has no originals, credentials or public port.
    'converter_url' => env('COMPANY_DATA_CONVERTER_URL', 'http://converter:3000'),
];
