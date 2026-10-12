<?php
namespace App\Http\Controllers;
use App\Services\CompanyData\{DataAssistant};
use App\Services\CompanyData\Assistant\PlanConnection;
use Illuminate\Http\Request;

class DataAssistantBridgeController extends Controller
{
    public function handle(Request $r, string $action, PlanConnection $connection, DataAssistant $assistant)
    {
        abort_if(strlen($r->getContent()) > 180000, 413);
        $owner = $connection->authenticate($r);
        $data = match ($action) {
            'heartbeat' => $connection->heartbeat($owner, $r->all()),
            'claim' => ['job' => $assistant->claimPlan($owner)],
            'progress' => $assistant->progressPlan($owner, $r->all()),
            'complete' => $assistant->completePlan($owner, $r->all()),
        };
        return response()->json($data)->header('Cache-Control', 'no-store');
    }
}
