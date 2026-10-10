<?php

namespace App\Services\Presales;

interface ExtractionProvider
{
    /** Public identity only; no credentials, URLs with credentials, or prompts. */
    public function identity(): array;
    /** Read-only extraction. All effects stay behind PresalesService::review. */
    public function extract(array $sources): array;
}
