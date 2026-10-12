<?php
namespace App\Services\CompanyData\Assistant;

class AnswerContract
{
    public static function validate(array $answer, array $sources): array
    {
        if (($answer['abstained'] ?? false) === true && ($answer['paragraphs'] ?? null) === []) return ['paragraphs' => [], 'abstained' => true];
        $paragraphs = $answer['paragraphs'] ?? null;
        if (!is_array($paragraphs) || !array_is_list($paragraphs) || !$paragraphs || count($paragraphs) > 12) throw new \UnexpectedValueException('INVALID_ANSWER');
        $map = array_column($sources, null, 'id'); $result = [];
        foreach ($paragraphs as $p) {
            if (!is_array($p) || !is_string($p['text'] ?? null) || trim($p['text']) === '' || mb_strlen($p['text']) > 4000
                || !is_array($p['citations'] ?? null) || !$p['citations'] || count($p['citations']) > 12) throw new \UnexpectedValueException('INVALID_ANSWER');
            $citations = [];
            foreach ($p['citations'] as $c) {
                if (!is_array($c) || !is_string($c['source_id'] ?? null) || !isset($map[$c['source_id']]) || !is_string($c['quote'] ?? null)
                    || mb_strlen(trim($c['quote'])) < 2 || mb_strlen($c['quote']) > 1200 || !str_contains($map[$c['source_id']]['body'], $c['quote'])) throw new \UnexpectedValueException('INVALID_CITATION');
                $citations[] = ['source_id' => $c['source_id'], 'quote' => $c['quote']];
            }
            $result[] = ['text' => $p['text'], 'citations' => $citations];
        }
        return ['paragraphs' => $result];
    }
}
