<?php
namespace App\Console\Commands;
use App\Services\CompanyData\DataDocuments;
use Illuminate\Console\Command;
class RecoverCompanyDocuments extends Command
{
    protected $signature = 'jingneng:recover-documents';
    protected $description = 'Prepare missing private document derivatives and recover interrupted processing';
    public function handle(DataDocuments $documents): int { $this->info('Queued documents: ' . $documents->recover()); return self::SUCCESS; }
}
