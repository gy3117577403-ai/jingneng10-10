<?php

namespace App\Jobs;

use App\Services\Presales\PresalesService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class ProcessPresalesRun implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;
    public int $tries = 1;
    public int $timeout = 90;
    public function __construct(public int $runId) {}
    public function handle(PresalesService $service): void { $service->execute($this->runId); }
}
