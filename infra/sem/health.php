<?php
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
Illuminate\Support\Facades\DB::select('SELECT 1');
Illuminate\Support\Facades\Redis::ping();
if (!is_file('/app/public/build/manifest.json')) {
    throw new RuntimeException('Vite assets missing');
}
echo "SEM database, Redis and assets ready\n";
