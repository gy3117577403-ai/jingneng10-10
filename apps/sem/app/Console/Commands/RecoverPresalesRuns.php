<?php

namespace App\Console\Commands;

use App\Services\Presales\PresalesService;
use Illuminate\Console\Command;

class RecoverPresalesRuns extends Command
{
    protected $signature = 'jingneng:recover-presales';
    protected $description = '恢复未投递或执行超时的售前模拟任务';
    public function handle(PresalesService $service): int { $this->info('已检查待处理记录，重新投递 ' . $service->recover() . ' 项。'); return self::SUCCESS; }
}
