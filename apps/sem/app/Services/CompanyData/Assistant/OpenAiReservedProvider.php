<?php
namespace App\Services\CompanyData\Assistant;

/** Deliberately inactive: no credential inspection, HTTP client or fallback. */
class OpenAiReservedProvider implements AnswerProvider
{
    public function answer(array $request): array
    {
        throw new \LogicException('MODEL_NOT_CONNECTED');
    }
}
