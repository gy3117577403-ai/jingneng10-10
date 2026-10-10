<?php
require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\{DB, Route, Storage};

if (($argv[1] ?? '') === 'queue') {
    $id = bin2hex(random_bytes(16));
    App\Jobs\JingnengQueueProbe::dispatch($id);
    echo json_encode(['id' => $id]);
    exit;
}
if (($argv[1] ?? '') === 'queue-result') {
    $id = $argv[2] ?? '';
    if (!preg_match('/^[a-f0-9]{32}$/', $id)) { exit(2); }
    echo Storage::disk('local')->get('private/queue-probe-' . $id . '.json') ?? '{}';
    exit;
}
$tables = ['users', 'companies', 'quotes', 'quote_lines', 'orders', 'order_lines', 'tasks', 'products', 'stocks',
           'purchases', 'purchase_lines', 'purchase_receipts', 'deliverys', 'delivery_lines', 'invoices', 'invoice_lines', 'files',
           'stock_moves', 'stock_location_products', 'jn_inquiries', 'jn_inquiry_members', 'jn_documents',
           'jn_file_versions', 'jn_ai_runs', 'jn_presales_events', 'jn_presales_receipts', 'jn_quote_sources',
           'jn_quote_reviews', 'jn_order_quote_reviews', 'jn_technical_handoffs', 'jn_handoff_versions', 'jn_sales_events', 'jn_sales_receipts',
           'jn_data_state', 'jn_data_groups', 'jn_data_members', 'jn_data_categories', 'jn_data_records', 'jn_data_versions',
           'jn_data_files', 'jn_data_rules', 'jn_data_access_requests', 'jn_data_tasks', 'jn_data_comments', 'jn_data_imports', 'jn_data_events', 'jn_data_receipts'];
$counts = [];
foreach ($tables as $table) {
    if (Illuminate\Support\Facades\Schema::hasTable($table)) { $counts[$table] = DB::table($table)->count(); }
}
$routes = [];
foreach (['presales.index', 'home', 'today', 'companies', 'leads', 'opportunities', 'quotes', 'orders', 'products', 'products.stock',
          'purchases', 'purchases.receipt', 'deliverys', 'invoices', 'production.kanban', 'production.gantt',
          'workshop', 'quality', 'reports', 'documents.index', 'spreadsheet.index', 'human.resources',
          'admin.kanban.settings', 'admin.integrations.ai.index'] as $name) {
    if (Route::has($name)) { $routes[$name] = route($name, [], false); }
}
$quotes = App\Models\Workflow\Quotes::where('code', 'like', 'DEMO-Q-%')->with('QuoteLines')->get();
$sup = App\Models\Companies\Companies::where('code', 'DEMO-SUPPLIER')->first();
$supplier = $sup ? [
    'id' => $sup->id,
    'address_id' => DB::table('companies_addresses')->where('companies_id', $sup->id)->value('id'),
    'contact_id' => DB::table('companies_contacts')->where('companies_id', $sup->id)->value('id'),
] : null;
$files = [];
foreach (['/app/storage/uploads', '/app/storage/app'] as $folder) {
    if (!is_dir($folder)) { continue; }
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($folder, FilesystemIterator::SKIP_DOTS)) as $file) {
        if ($file->isFile()) { $files[substr($file->getPathname(), strlen('/app/storage/'))] = hash_file('sha256', $file->getPathname()); }
    }
}
ksort($files);
echo json_encode([
    'admin_id' => App\Models\User::where('email', env('JINGNENG_DEMO_EMAIL'))->value('id'),
    'raw_location_id' => DB::table('stock_locations')->where('code', 'DEMO-RAW-A01')->value('id'),
    'order_tasks' => App\Models\Planning\Task::whereNotNull('order_lines_id')->get(['id', 'order_lines_id', 'status_id']),
    'stock_positions' => App\Models\Products\StockLocationProducts::get()->map(fn ($row) => [
        'id' => $row->id, 'qty' => $row->getCurrentStockMove(), 'product_id' => $row->products_id,
    ]),
    'counts' => $counts, 'routes' => $routes, 'quotes' => $quotes, 'supplier' => $supplier,
    'sheet_product' => App\Models\Products\Products::where('code', 'DEMO-SHEET-2MM')->first(),
    'files' => $files, 'locale' => config('app.locale'), 'timezone' => config('app.timezone'),
    'queue_connection' => config('queue.default'), 'debug' => config('app.debug'),
    'default_admin_exists' => App\Models\User::where('email', 'contact@wem-project.org')->exists(),
], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
