<?php
namespace App\Console\Commands;
use App\Services\CompanyData\DataAssistant;
use Illuminate\Console\Command;
class RecoverDataAnswers extends Command
{
    protected $signature = 'jingneng:recover-answers';
    protected $description = 'Recover interrupted private source assistant requests';
    public function handle(DataAssistant $assistant): int { $this->info('Recovered answers: ' . $assistant->recover()); return self::SUCCESS; }
}
