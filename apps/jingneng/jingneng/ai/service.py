"""Persistent run ledger and review gate; all writes share F1 authorization."""
import hashlib
import json
import time
import uuid
from datetime import timedelta
import frappe
from frappe.utils import now_datetime, get_datetime
from jingneng.workbench import service as svc
from jingneng.workbench.permissions import accessible
from jingneng.ai import adapter

RUN = 'JN AI Run'
ACTIVE = ('排队中', '运行中', '待审核', '结果待核对')
MAX_TEXT_BYTES = 200000


def parse(value):
    return json.loads(value or '{}')


def get_run(name, lock=False):
    # Every code path locks the inquiry before its run to avoid lock inversion.
    inquiry = frappe.db.get_value(RUN, name, 'inquiry')
    if not inquiry:
        frappe.throw('运行记录不存在。', frappe.DoesNotExistError)
    doc = svc.read_inquiry(inquiry, lock=lock)
    return doc, frappe.get_doc(RUN, name, for_update=lock)


def stale(doc, run):
    return doc.revision != run.inquiry_revision or doc.status != '协作中'


def can_control(doc, run):
    return svc.editable(doc) or run.requested_by == frappe.session.user


def queue_run(name):
    # Queue is a delivery mechanism, not the authoritative task ledger.
    try:
        frappe.enqueue('jingneng.ai.service.execute', queue='short', timeout=90, run_name=name)
    except Exception:
        # The committed queued row is retried by the minute reconciler.
        pass


def enqueue_after_commit(name):
    frappe.db.after_commit.add(lambda: queue_run(name))


def start(name, expected_revision, revisions, scenario, request_id):
    svc.read_inquiry(name)
    if scenario not in adapter.SCENARIOS:
        frappe.throw('模拟场景无效。')
    if not isinstance(revisions, list) or not 1 <= len(revisions) <= 5 or any(not isinstance(r, str) for r in revisions) or len(set(revisions)) != len(revisions):
        frappe.throw('请选择 1 至 5 个不同资料的当前版本。')
    revisions = sorted(revisions)
    def action():
        doc = svc.read_inquiry(name, lock=True)
        svc.check_revision(doc, expected_revision)
        svc.require_open(doc)
        sources, documents = [], set()
        for revision_name in revisions:
            r = frappe.get_doc('JN File Revision', revision_name)
            if r.inquiry != name:
                frappe.throw('所选资料不属于此询价。', frappe.PermissionError)
            if r.document in documents or frappe.db.get_value('JN Document', r.document, 'current_version') != r.version_number:
                frappe.throw('只能选择每份资料的当前版本。', svc.Conflict)
            if not r.filename.lower().endswith(('.txt', '.csv')) or r.file_size > MAX_TEXT_BYTES:
                frappe.throw('本批模拟读取 UTF-8 TXT/CSV，每个不超过 200 KB；PDF、图片和 Office 原件仍可保存，但尚未解析。')
            documents.add(r.document)
            sources.append(dict(revision=r.name, document=r.document, version=r.version_number,
                                filename=r.filename, sha256=r.sha256, bytes=r.file_size))
        frozen = dict(inquiry=svc.inquiry_snapshot(doc), sources=sources, adapter=adapter.VERSION,
                      prompt=adapter.PROMPT_VERSION, scenario=scenario, requested_by=frappe.session.user)
        dedupe = hashlib.sha256(svc.encode(frozen).encode()).hexdigest()
        existing = frappe.db.get_value(RUN, {'dedupe_key': dedupe}, 'name')
        if existing:
            return {'name': existing, 'duplicate': True}
        run = svc.insert(RUN, record_id=svc.identifier('AIR'), inquiry=name, requested_by=frappe.session.user,
                         status='排队中', mode='simulation', adapter_version=adapter.VERSION,
                         prompt_version=adapter.PROMPT_VERSION, scenario=scenario, dedupe_key=dedupe,
                         inquiry_revision=doc.revision, attempt=1, input_json=svc.encode(frozen))
        svc.event(doc, 'ai.queued', '提交资料模拟提取，等待后台执行', target=run,
                  details={'mode': 'simulation', 'sources': sources, 'inquiry_revision': doc.revision})
        enqueue_after_commit(run.name)
        return {'name': run.name, 'duplicate': False}
    return svc.command('ai.start', request_id, [name, expected_revision, revisions, scenario], action)


def read_sources(run):
    sources = []
    for item in parse(run.input_json)['sources']:
        revision = frappe.get_doc('JN File Revision', item['revision'])
        if revision.inquiry != run.inquiry or revision.sha256 != item['sha256']:
            raise adapter.AdapterFailure('SOURCE_CHANGED', '原件版本或摘要不一致，已停止处理。')
        content = frappe.get_doc('File', revision.file).get_content()
        if isinstance(content, str):
            content = content.encode()
        if len(content) > MAX_TEXT_BYTES or hashlib.sha256(content).hexdigest() != item['sha256']:
            raise adapter.AdapterFailure('SOURCE_CHANGED', '原件摘要不一致，已停止处理。')
        try:
            text = content.decode('utf-8-sig')
        except UnicodeDecodeError:
            raise adapter.AdapterFailure('TEXT_ENCODING', '请将文本另存为 UTF-8 后上传新版本。')
        if '\x00' in text or len(text) > 40000 or any(len(line) > 5000 for line in text.splitlines()):
            raise adapter.AdapterFailure('TEXT_LIMIT', '文本需不超过 4 万字、单行不超过 5 千字，且不含二进制内容。')
        text = '\n'.join(text.splitlines())  # one line convention for evidence and UI
        sources.append({**item, 'text': text})
    return sources


def execute(run_name):
    original_user = frappe.session.user
    run = frappe.get_doc(RUN, run_name)
    frappe.set_user(run.requested_by)
    token = uuid.uuid4().hex
    started = time.monotonic()
    try:
        doc = frappe.get_doc('JN Inquiry', run.inquiry, for_update=True)
        run = frappe.get_doc(RUN, run_name, for_update=True)
        if run.status != '排队中':
            return
        run.status, run.worker_token, run.started_at = '运行中', token, now_datetime()
        run.finished_at, run.error_code, run.error_message = None, '', ''
        svc.save(run)
        frappe.db.commit()  # durable claim before any work outside the transaction
        try:
            svc.require_user()
            if not frappe.db.get_value('User', run.requested_by, 'enabled') or not accessible(doc):
                raise adapter.AdapterFailure('ACCESS_REVOKED', '发起人的访问权限已变化，任务停止。')
            if stale(doc, run):
                raise adapter.AdapterFailure('STALE_INPUT', '询价已更新或归档，请基于最新记录重新提取。')
            sources = read_sources(run)
            result = adapter.validate_result(adapter.generate(sources, run.scenario, run.attempt), sources)
            failure = None
        except adapter.AdapterFailure as exc:
            sources, result, failure = [], None, exc
        except frappe.PermissionError:
            sources, result, failure = [], None, adapter.AdapterFailure('ACCESS_REVOKED', '发起人的权限已变化，任务停止。')
        except Exception:
            sources, result, failure = [], None, adapter.AdapterFailure('EXECUTION_ERROR', '后台执行失败，请保留运行编号后重试或联系管理员。')
        # End the read snapshot and reload both locks. A cancel/recovery wins
        # over a late worker; an old token cannot publish into a new attempt.
        frappe.db.rollback()
        doc = frappe.get_doc('JN Inquiry', run.inquiry, for_update=True)
        run = frappe.get_doc(RUN, run_name, for_update=True)
        if run.status != '运行中' or run.worker_token != token:
            return
        if not accessible(doc) or not frappe.db.get_value('User', run.requested_by, 'enabled'):
            failure = adapter.AdapterFailure('ACCESS_REVOKED', '发起人的访问权限已变化，任务停止。')
        run.finished_at, run.elapsed_ms = now_datetime(), round((time.monotonic() - started) * 1000)
        if failure:
            run.status = '结果待核对' if failure.unknown else '失败'
            run.error_code, run.error_message = failure.code, failure.message
        else:
            run.status, run.sources_json, run.result_json = '待审核', svc.encode(sources), svc.encode(result)
        svc.save(run)
        svc.event(doc, 'ai.finished', '模拟提取：' + run.status, target=run,
                  details={'attempt': run.attempt, 'error_code': run.error_code, 'elapsed_ms': run.elapsed_ms, 'model_calls': 0})
        frappe.db.commit()
    finally:
        frappe.db.rollback()
        frappe.set_user(original_user)


def control(name, action, request_id):
    doc, run = get_run(name)
    if not can_control(doc, run):
        frappe.throw('仅发起人、负责人或管理员可操作此运行。', frappe.PermissionError)
    def perform():
        doc, run = get_run(name, lock=True)
        if not can_control(doc, run):
            frappe.throw('无权操作。', frappe.PermissionError)
        if action == 'retry' and run.status == '失败' and run.attempt < 3:
            if stale(doc, run):
                frappe.throw('旧输入已过期，请使用最新版本新建提取。', svc.Conflict)
            svc.require_open(doc)
            run.status, run.attempt, run.worker_token = '排队中', run.attempt + 1, ''
            svc.save(run)
            enqueue_after_commit(run.name)
        elif action == 'cancel' and run.status in ACTIVE:
            run.status, run.worker_token, run.finished_at = '已取消', '', now_datetime()
            svc.save(run)
        else:
            frappe.throw('当前状态不允许此操作；结果不确定不会自动重试，失败最多执行三次。', svc.Conflict)
        svc.event(doc, 'ai.' + action, '重试模拟提取' if action == 'retry' else '取消模拟提取', target=run,
                  details={'attempt': run.attempt, 'previous_error': run.error_code})
        return {'name': name, 'status': run.status}
    return svc.command('ai.' + action, request_id, [name, action], perform)


def review(name, expected_revision, decision, changes, reason, request_id):
    doc, run = get_run(name)
    if not svc.editable(doc):
        frappe.throw('候选由询价负责人或管理员审核。', frappe.PermissionError)
    reason = svc.text(reason, '审核说明', 1000, True)
    if decision not in ('accept', 'reject') or not isinstance(changes, dict):
        frappe.throw('审核格式无效。')
    def perform():
        doc, run = get_run(name, lock=True)
        if not svc.editable(doc):
            frappe.throw('无权审核。', frappe.PermissionError)
        if run.status != '待审核':
            frappe.throw('本次运行已处理，不能重复审核。', svc.Conflict)
        before = {field: doc.get(field) for field in adapter.FIELDS}
        applied = {}
        if decision == 'accept':
            svc.check_revision(doc, expected_revision)
            svc.require_open(doc)
            if stale(doc, run):
                frappe.throw('来源记录已变化，旧候选仅供查看；请重新提取后审核。', svc.Conflict)
            result = adapter.validate_result(parse(run.result_json), json.loads(run.sources_json))
            allowed = {row['field'] for row in result['candidates']}
            if not changes or set(changes) - allowed:
                frappe.throw('仅可采纳本次生成的候选字段，至少选择一项。')
            try:
                applied = {field: adapter.valid_value(field, value) for field, value in changes.items()}
            except adapter.AdapterFailure as exc:
                frappe.throw(exc.message)
            svc.apply_reviewed_fields(doc, applied)
        elif changes:
            frappe.throw('驳回不得包含写入内容。')
        review = svc.insert('JN AI Review', record_id=svc.identifier('AIV'), inquiry=doc.name, run=run.name,
                            reviewed_by=frappe.session.user, decision=decision, reason=reason,
                            changes_json=svc.encode({'before': before, 'applied': applied,
                                                     'after': {f: doc.get(f) for f in adapter.FIELDS},
                                                     'source_revision': run.inquiry_revision, 'result_revision': doc.revision}))
        run.status = '已采纳' if decision == 'accept' else '已驳回'
        svc.save(run)
        svc.event(doc, 'ai.reviewed', '人工采纳模拟候选' if decision == 'accept' else '人工驳回模拟候选', target=review,
                  details={'run': run.name, 'decision': decision, 'reason': reason, 'changes': parse(review.changes_json)})
        return {'name': run.name, 'status': run.status, 'review': review.name, 'revision': doc.revision}
    return svc.command('ai.review', request_id, [name, expected_revision, decision, changes, reason], perform)


def detail(name):
    doc, run = get_run(name)
    result = {f: run.get(f) for f in ('name', 'inquiry', 'requested_by', 'status', 'mode', 'adapter_version', 'prompt_version',
              'scenario', 'inquiry_revision', 'attempt', 'started_at', 'finished_at', 'elapsed_ms', 'error_code', 'error_message', 'creation')}
    result.update(stale=stale(doc, run), current_revision=doc.revision, can_review=svc.editable(doc),
                  can_control=can_control(doc, run), input=parse(run.input_json),
                  sources=json.loads(run.sources_json or '[]'), result=parse(run.result_json))
    result['review'] = frappe.db.get_value('JN AI Review', {'run': name}, ['name', 'reviewed_by', 'decision', 'reason', 'changes_json', 'creation'], as_dict=True)
    return result


def list_runs(name):
    doc = svc.read_inquiry(name)
    rows = frappe.get_all(RUN, filters={'inquiry': name}, fields=['name', 'status', 'mode', 'scenario', 'inquiry_revision', 'attempt', 'creation', 'requested_by'], order_by='creation desc', limit_page_length=100)
    for row in rows:
        row['stale'] = stale(doc, row)
    return rows


def recover():
    """Minute reconciler: redeliver queued rows and reclaim expired MOCK leases.

    A future provider with external effects must mark expired calls unknown.
    A token change fences late workers even when a queue delivery is repeated.
    """
    cutoff = now_datetime() - timedelta(seconds=120)
    names = frappe.get_all(RUN, filters={'status': ['in', ['排队中', '运行中']]}, pluck='name', limit_page_length=200, order_by='modified asc')
    for name in names:
        try:
            inquiry = frappe.db.get_value(RUN, name, 'inquiry')
            doc = frappe.get_doc('JN Inquiry', inquiry, for_update=True)
            run = frappe.get_doc(RUN, name, for_update=True)
            if run.status == '运行中' and get_datetime(run.started_at) < cutoff:
                if run.mode == 'simulation' and run.attempt < 3:
                    run.status, run.attempt = '排队中', run.attempt + 1
                else:
                    run.status, run.error_code = '结果待核对', 'LEASE_EXPIRED'
                    run.error_message = '运行中断且无法确认结果，请人工核对；未自动重试。'
                run.worker_token = ''
                svc.save(run)
                svc.event(doc, 'ai.recovered', '检测到执行中断：' + run.status, target=run, details={'mode': run.mode, 'attempt': run.attempt})
            if run.status == '排队中':
                enqueue_after_commit(name)
            frappe.db.commit()
        except Exception:
            frappe.db.rollback()
