<?php
namespace App\Jobs;

use App\Services\CompanyData\DataDocuments;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

class ProcessCompanyDocument implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;
    public int $tries = 1;
    public int $timeout = 110;
    public function __construct(public int $fileId) {}
    public function handle(DataDocuments $documents): void { $documents->process($this->fileId); }
}
