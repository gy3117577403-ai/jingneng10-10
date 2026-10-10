<?php

namespace App\Services\CompanyData;

use Illuminate\Validation\ValidationException;

class DataSchema
{
    public static function fields(array $fields, array $previous = [], bool $used = false): array
    {
        validator(['fields' => $fields], ['fields' => 'array|max:30', 'fields.*.key' => ['required', 'string', 'max:40', 'regex:/^[a-z][a-z0-9_]*$/'],
            'fields.*.label' => 'required|string|max:50', 'fields.*.type' => 'required|in:text,multiline,number,date,select,boolean', 'fields.*.required' => 'required|boolean',
            'fields.*.options' => 'nullable|array|max:40', 'fields.*.options.*' => 'string|max:80'])->validate();
        $keys = []; $labels = []; $clean = [];
        foreach ($fields as $f) {
            $label = trim($f['label']);
            abort_if(!$label || in_array($f['key'], [...$keys, 'code', 'title'], true) || in_array($label, [...$labels, '编号', '名称'], true), 422, '字段标识和名称不能重复，也不能使用“编号”“名称”。');
            $options = array_values(array_unique(array_map('trim', $f['options'] ?? [])));
            abort_if($f['type'] === 'select' && (!$options || in_array('', $options, true)), 422, '选择字段需要填写不重复的选项。');
            $keys[] = $f['key']; $labels[] = $label; $clean[] = ['key' => $f['key'], 'label' => $label, 'type' => $f['type'], 'required' => (bool) $f['required'], 'options' => $f['type'] === 'select' ? $options : []];
        }
        if ($used) foreach ($previous as $old) {
            $new = collect($clean)->firstWhere('key', $old['key']);
            abort_unless($new && $new['type'] === $old['type'], 422, '已有资料的字段不可删除或改变类型，可修改显示名称、必填要求或增加字段。');
        }
        return $clean;
    }
    public static function values(array $values, array $fields): array
    {
        $clean = []; $errors = []; $keys = array_column($fields, 'key');
        foreach ($values as $key => $value) if (!in_array($key, $keys, true)) $errors['values.' . $key] = '存在未定义字段，请重新读取字段配置。';
        foreach ($fields as $f) {
            $value = $values[$f['key']] ?? null; $key = 'values.' . $f['key'];
            if ($value === null || $value === '') { if ($f['required']) $errors[$key] = $f['label'] . '不能为空。'; $clean[$f['key']] = null; continue; }
            if (is_array($value) || is_object($value)) { $errors[$key] = $f['label'] . '格式无效。'; continue; }
            if ($f['type'] === 'boolean') {
                if (is_bool($value)) $clean[$f['key']] = $value;
                elseif (in_array((string) $value, ['1', '0', '是', '否', 'true', 'false'], true)) $clean[$f['key']] = in_array((string) $value, ['1', '是', 'true'], true);
                else $errors[$key] = $f['label'] . '请选择是或否。';
                continue;
            }
            $value = trim((string) $value);
            if ($value === '' && $f['required']) $errors[$key] = $f['label'] . '不能为空。';
            if (mb_strlen($value) > ($f['type'] === 'multiline' ? 5000 : 500)) $errors[$key] = $f['label'] . '内容过长。';
            if ($f['type'] === 'number' && !preg_match('/^-?\d{1,14}(\.\d{1,6})?$/D', $value)) $errors[$key] = $f['label'] . '请输入数字，最多14位整数、6位小数。';
            if ($f['type'] === 'date' && (!preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value) || !checkdate((int) substr($value, 5, 2), (int) substr($value, 8, 2), (int) substr($value, 0, 4)))) $errors[$key] = $f['label'] . '请使用有效的年-月-日日期。';
            if ($f['type'] === 'select' && !in_array($value, $f['options'], true)) $errors[$key] = $f['label'] . '不在可选范围内。';
            $clean[$f['key']] = $value;
        }
        if ($errors) throw ValidationException::withMessages($errors);
        return $clean;
    }
}
