<?php
// Verify locale coverage directly from the shipped application, without a database.
$root = '/app/resources/lang';
$missing = [];
$placeholderErrors = [];
$checked = 0;
$flatten = function (array $items, string $prefix = '') use (&$flatten): array {
    $flat = [];
    foreach ($items as $key => $value) {
        $name = $prefix . $key;
        if (is_array($value)) {
            $flat += $flatten($value, $name . '.');
        } else {
            $flat[$name] = $value;
        }
    }
    return $flat;
};
foreach (glob($root . '/en/*.php') as $file) {
    $group = basename($file);
    $target = $root . '/zh-CN/' . $group;
    $en = $flatten(require $file);
    $zh = is_file($target) ? $flatten(require $target) : [];
    foreach ($en as $key => $value) {
        $checked++;
        if (!array_key_exists($key, $zh) || !is_string($zh[$key]) || $zh[$key] === '') {
            $missing[] = $group . ':' . $key;
            continue;
        }
        preg_match_all('/(?<![\w:]):[a-zA-Z_]\w*/', (string) $value, $sourceArgs);
        preg_match_all('/(?<![\w:]):[a-zA-Z_]\w*/', $zh[$key], $targetArgs);
        if (array_diff($sourceArgs[0], $targetArgs[0])) {
            $placeholderErrors[] = $group . ':' . $key;
        }
    }
}
$json = json_decode(file_get_contents($root . '/zh-CN.json'), true, 512, JSON_THROW_ON_ERROR);
$result = [
    'catalog_keys_checked' => $checked,
    'authored_ui_translations' => count($json),
    'missing_keys' => $missing,
    'placeholder_errors' => $placeholderErrors,
];
echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";
exit($missing || $placeholderErrors ? 1 : 0);
