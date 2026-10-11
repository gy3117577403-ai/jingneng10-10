<?php
namespace App\Jobs;
use App\Services\CompanyData\DataAssistant;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
class ProcessDataAnswer implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;
    public int $tries = 1;
    public int $timeout = 90;
    public function __construct(public int $answerId) {}
    public function handle(DataAssistant $assistant): void { $assistant->process($this->answerId); }
}
