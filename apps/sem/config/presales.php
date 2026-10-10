<?php

return [
    // A deployment chooses an explicitly registered adapter. No browser supplied class or URL.
    'provider' => env('PRESALES_PROVIDER', 'simulation'),
    'providers' => ['simulation' => App\Services\Presales\SimulatedExtractor::class],
];
