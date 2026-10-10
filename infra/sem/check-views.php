<?php
// Compile all Blade views, then lint the generated PHP, including rarely opened forms.
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
Illuminate\Support\Facades\Artisan::call('view:cache');
$failures = [];
$views = glob('/app/storage/framework/views/*.php');
foreach ($views as $file) {
    $output = [];
    exec('php -l ' . escapeshellarg($file) . ' 2>&1', $output, $code);
    if ($code) {
        $failures[] = ['error' => $output, 'source' => substr(file_get_contents($file), -220)];
    }
}
echo json_encode(['compiled_views' => count($views), 'failures' => $failures], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";
exit($failures ? 1 : 0);
