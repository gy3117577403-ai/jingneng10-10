<?php

namespace App\Services\Presales;

class ExtractionGateway
{
    public function provider(?array $pinned = null): ExtractionProvider
    {
        $key = $pinned['provider'] ?? config('presales.provider', 'simulation');
        $class = config('presales.providers.' . $key);
        abort_unless(is_string($class) && is_subclass_of($class, ExtractionProvider::class), 422, '所选提取服务尚未配置，请检查本机配置。');
        $provider = app($class);
        $identity = $provider->identity();
        abort_unless(($identity['provider'] ?? null) === $key && isset($identity['version'], $identity['mode']), 422, '提取服务标识不完整。');
        abort_if($pinned && $pinned !== $identity, 409, '提取服务版本已变化，请重新发起处理。');
        return $provider;
    }

    public function extract(ExtractionProvider $provider, array $sources): array
    {
        $result = $provider->extract($sources);
        // Validate every adapter at the same boundary, before any human review can write data.
        if (!is_array($result['candidates'] ?? null) || !is_array($result['questions'] ?? null) || count($result['questions']) > 30) {
            throw new \UnexpectedValueException('提取结果不符合约定。');
        }
        foreach ($result['questions'] as $question) {
            if (!is_string($question) || mb_strlen($question) > 1000) { throw new \UnexpectedValueException('待核对信息格式无效。'); }
        }
        $byId = array_column($sources, null, 'version_id');
        foreach ($result['candidates'] as $field => $candidate) {
            if (!is_array($candidate) || !SimulatedExtractor::validValue($field, $candidate['value'] ?? null) || !is_array($candidate['sources'] ?? null) || !$candidate['sources'] || count($candidate['sources']) > 100) {
                throw new \UnexpectedValueException('候选字段或来源缺失。');
            }
            foreach ($candidate['sources'] as $reference) {
                $source = $byId[$reference['version_id'] ?? 0] ?? null;
                $line = $reference['line'] ?? null;
                if (!$source || !is_int($line) || $line < 1 || (explode("\n", $source['text'])[$line - 1] ?? null) !== ($reference['quote'] ?? null)) {
                    throw new \UnexpectedValueException('候选引用与原件不一致。');
                }
            }
        }
        $usage = $result['usage'] ?? null;
        if ($usage !== null) {
            foreach (['input_tokens', 'output_tokens'] as $key) {
                if (!is_int($usage[$key] ?? null) || $usage[$key] < 0) { throw new \UnexpectedValueException('用量格式无效。'); }
            }
            $usage = array_intersect_key($usage, array_flip(['input_tokens', 'output_tokens']));
        }
        return ['mode' => $provider->identity()['mode'], 'adapter' => $provider->identity()['version'],
            'candidates' => $result['candidates'], 'questions' => $result['questions'], 'usage' => $usage];
    }
}
