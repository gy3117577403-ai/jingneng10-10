<?php
namespace App\Services\CompanyData\Assistant;

class ExcerptProvider implements AnswerProvider
{
    public function answer(array $request): array
    {
        return ['paragraphs' => array_map(function ($source) {
            $quote = $source['excerpt'];
            return ['text' => $quote, 'citations' => [['source_id' => $source['id'], 'quote' => $quote]]];
        }, $request['sources'])];
    }
}
