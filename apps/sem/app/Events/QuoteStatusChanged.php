<?php

namespace App\Events;

use App\Models\Workflow\Quotes;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class QuoteStatusChanged
{
    use Dispatchable, SerializesModels;

    public $quote;
    public $quoteId;
    public $newStatus;

    public function __construct(Quotes $quote, int $newStatus)
    {
        $this->quote     = $quote;
        $this->quoteId   = $quote->id;
        $this->newStatus = $newStatus;
    }
}
