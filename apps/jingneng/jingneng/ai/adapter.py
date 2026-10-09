"""Pure, bounded adapter contract. Documents are data, never tool instructions.

The simulator only matches three anchored labels. No model or network is used.
A future real adapter must retain evidence validation and unknown-outcome rules.
"""
from datetime import date
import re

VERSION = 'simulation-labels-v1'
PROMPT_VERSION = 'source-fields-v1'
FIELDS = {'customer_name': ('客户名称', 140), 'expected_date': ('期望交期', 10), 'notes': ('需求说明', 4000)}
SCENARIOS = ('normal', 'fail_once', 'unknown_once')


class AdapterFailure(Exception):
    def __init__(self, code, message, unknown=False):
        self.code, self.message, self.unknown = code, message, unknown
        super().__init__(message)


def valid_value(field, value):
    if field not in FIELDS or not isinstance(value, str) or not value.strip() or len(value) > FIELDS[field][1]:
        raise AdapterFailure('INVALID_RESULT', '候选字段或长度不符合约定，未写入业务记录。')
    if field == 'expected_date':
        try:
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
                raise ValueError()
            date.fromisoformat(value)
        except ValueError:
            raise AdapterFailure('INVALID_DATE', '期望交期需要有效的 YYYY-MM-DD 日期。')
    return value.strip()


def generate(sources, scenario='normal', attempt=1):
    if scenario == 'fail_once' and attempt == 1:
        raise AdapterFailure('SIMULATED_FAILURE', '模拟首次执行失败；可手动重试同一任务，不重复建单。')
    if scenario == 'unknown_once' and attempt == 1:
        raise AdapterFailure('SIMULATED_UNKNOWN', '模拟调用结果不确定；禁止自动重试，请核对后取消本次运行。', unknown=True)
    candidates, questions = [], []
    for field, (label, maximum) in FIELDS.items():
        matches = []
        for source in sources:
            for index, line in enumerate(source['text'].splitlines(), 1):
                match = re.fullmatch(re.escape(label) + r'\s*[:：,，]\s*(\S.*)', line.strip())
                if match:
                    matches.append({'value': match[1].strip(), 'source': source['revision'], 'line': index, 'quote': line})
        if not matches:
            questions.append('请补充' + label + '。')
        elif len({m['value'] for m in matches}) != 1:
            questions.append(label + '在所选资料中存在冲突，请人工核对各版原件。')
        else:
            value = valid_value(field, matches[0]['value'])
            candidates.append({'field': field, 'label': label, 'value': value, 'evidence': matches[:10]})
    return {'candidates': candidates, 'questions': questions, 'usage': {'model_calls': 0, 'cost': 0, 'currency': 'CNY', 'tokens': None}}


def validate_result(result, sources):
    """Reject schema drift, fabricated citations and unapproved target fields."""
    if not isinstance(result, dict) or set(result) != {'candidates', 'questions', 'usage'}:
        raise AdapterFailure('INVALID_RESULT', '候选输出格式不符合约定。')
    rows, seen = result['candidates'], set()
    if not isinstance(rows, list) or len(rows) > len(FIELDS):
        raise AdapterFailure('INVALID_RESULT', '候选数量不符合约定。')
    source_map = {s['revision']: s['text'].splitlines() for s in sources}
    for row in rows:
        if not isinstance(row, dict) or set(row) != {'field', 'label', 'value', 'evidence'}:
            raise AdapterFailure('INVALID_RESULT', '候选输出格式不符合约定。')
        field = row['field']
        valid_value(field, row['value'])
        if field in seen or row['label'] != FIELDS[field][0]:
            raise AdapterFailure('INVALID_RESULT', '候选字段重复或标签错误。')
        seen.add(field)
        if not isinstance(row['evidence'], list) or not 1 <= len(row['evidence']) <= 10:
            raise AdapterFailure('INVALID_EVIDENCE', '候选缺少来源。')
        for evidence in row['evidence']:
            if not isinstance(evidence, dict) or set(evidence) != {'value', 'source', 'line', 'quote'}:
                raise AdapterFailure('INVALID_EVIDENCE', '来源格式错误。')
            lines = source_map.get(evidence['source'], [])
            n = evidence['line']
            if type(n) is not int or not 1 <= n <= len(lines) or lines[n - 1] != evidence['quote'] or row['value'] not in evidence['quote']:
                raise AdapterFailure('INVALID_EVIDENCE', '来源无法与冻结原文对应。')
    if not isinstance(result['questions'], list) or len(result['questions']) > 10 or any(not isinstance(q, str) or len(q) > 300 for q in result['questions']):
        raise AdapterFailure('INVALID_RESULT', '待补充问题格式错误。')
    if result['usage'] != {'model_calls': 0, 'cost': 0, 'currency': 'CNY', 'tokens': None}:
        raise AdapterFailure('INVALID_RESULT', '模拟用量记录无效。')
    return result
