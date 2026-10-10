<?php

namespace App\Services\Presales;

/** A deterministic offline adapter. Source documents never become instructions. */
class SimulatedExtractor
{
    public const VERSION = 'fixed-labels-v1';
    public const FIELDS = ['customer_name' => '客户名称', 'expected_date' => '期望交期', 'requirements' => '需求说明'];

    public static function validValue(string $field, mixed $value): bool
    {
        if (!is_string($value) || trim($value) === '') { return false; }
        if ($field === 'expected_date') {
            $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
            return $date && $date->format('Y-m-d') === $value;
        }
        return isset(self::FIELDS[$field]) && mb_strlen($value) <= ($field === 'customer_name' ? 140 : 4000);
    }

    public function extract(array $sources): array
    {
        $found = []; $questions = []; $candidates = [];
        foreach ($sources as $source) {
            foreach (explode("\n", $source['text']) as $index => $line) {
                if (!preg_match('/^\s*(客户名称|期望交期|需求说明)\s*[：:,，]\s*(.*?)\s*$/u', $line, $match)) { continue; }
                $field = array_search($match[1], self::FIELDS, true);
                $found[$field][] = ['value' => $match[2], 'version_id' => $source['version_id'], 'line' => $index + 1, 'quote' => $line];
            }
        }
        foreach (self::FIELDS as $field => $label) {
            $hits = $found[$field] ?? [];
            $values = array_unique(array_column($hits, 'value'));
            if (!$hits) { $questions[] = $label . '未找到，请补充资料或手工填写。'; continue; }
            if (count($values) !== 1) { $questions[] = $label . '存在多个不同值，请先核对来源。'; continue; }
            $value = $hits[0]['value'];
            if (!self::validValue($field, $value)) { $questions[] = $label . '格式或长度不符合要求，请核对原文。'; continue; }
            $candidates[$field] = ['value' => $value, 'sources' => array_map(fn ($h) => array_diff_key($h, ['value' => true]), $hits)];
        }
        return ['mode' => 'simulation', 'adapter' => self::VERSION, 'candidates' => $candidates, 'questions' => $questions];
    }
}
