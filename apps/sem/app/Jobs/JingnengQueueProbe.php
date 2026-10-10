<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;

/** Internal deployment probe, only dispatched from the local CLI. */
class JingnengQueueProbe implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public string $id) {}

    public function handle(): void
    {
        if (!preg_match('/^[a-f0-9]{32}$/', $this->id)) {
            throw new \InvalidArgumentException(__('Invalid probe identifier.'));
        }
        Storage::disk('local')->put('private/queue-probe-' . $this->id . '.json', json_encode([
            'id' => $this->id, 'handled_at' => now()->toIso8601String(), 'pid' => getmypid(),
        ]));
    }
}
