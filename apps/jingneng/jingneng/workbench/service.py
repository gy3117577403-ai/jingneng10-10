"""Transactional collaboration actions. Model adapters/AI must use this boundary."""
from contextlib import contextmanager
from datetime import date
import hashlib
import io
import json
import math
from pathlib import PurePosixPath
import re
import time
import uuid
import zipfile

import frappe
from jingneng.workbench.permissions import accessible, manager

MAX_UPLOAD = 10 * 1024 * 1024
MAX_EXPORT = 50 * 1024 * 1024
FILE_TYPES = {'.pdf', '.txt', '.csv', '.xlsx', '.docx', '.png', '.jpg', '.jpeg', '.dxf'}


class Conflict(frappe.ValidationError):
    http_status_code = 409


def require_user():
    if frappe.session.user == 'Guest':
        frappe.throw('请先登录。', frappe.PermissionError)
    if not manager() and not {'JN Sales', 'JN Technical'}.intersection(frappe.get_roles()):
        frappe.throw('当前账号尚未启用工作台。', frappe.PermissionError)


def can_create():
    return manager() or 'JN Sales' in frappe.get_roles()


def editable(inquiry):
    return manager() or inquiry.responsible == frappe.session.user


@contextmanager
def writing():
    old = getattr(frappe.flags, 'jn_service_write', False)
    frappe.flags.jn_service_write = True
    try:
        yield
    finally:
        frappe.flags.jn_service_write = old


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str, separators=(',', ':'))


def identifier(prefix):
    return prefix + '-' + uuid.uuid4().hex[:16]


def insert(doctype, **values):
    with writing():
        return frappe.get_doc(dict(doctype=doctype, **values)).insert(ignore_permissions=True)


def save(doc):
    with writing():
        doc.save(ignore_permissions=True)


def command(kind, request_id, payload, run):
    # No endpoint writes before this boundary. MariaDB may abort a competing
    # insert under repeatable-read; retry the entire rolled-back transaction.
    for attempt in range(3):
        try:
            return _command(kind, request_id, payload, run)
        except frappe.QueryDeadlockError:
            frappe.db.rollback()
            if attempt == 2:
                frappe.throw('并发操作繁忙，请使用同一请求重新提交。', Conflict)
            time.sleep(0.05 * (attempt + 1))


def _command(kind, request_id, payload, run):
    """The unique operation row serializes retries, in the same DB transaction."""
    require_user()
    if not isinstance(request_id, str) or not re.fullmatch(r'[a-zA-Z0-9-]{16,64}', request_id):
        frappe.throw('请求标识无效，请重新打开操作窗口。')
    key = hashlib.sha256((frappe.session.user + ':' + request_id).encode()).hexdigest()
    digest = hashlib.sha256(encode({'kind': kind, 'payload': payload}).encode()).hexdigest()
    frappe.db.savepoint('jn_operation')
    try:
        op = insert('JN Operation', record_id=key, actor=frappe.session.user, kind=kind, payload_hash=digest)
    except frappe.DuplicateEntryError:
        frappe.db.rollback(save_point='jn_operation')
        op = frappe.get_doc('JN Operation', key, for_update=True)
        if op.payload_hash != digest:
            frappe.throw('同一请求标识对应不同内容，请刷新后重试。', Conflict)
        if not op.result_json:
            frappe.throw('请求正在处理中，请稍后刷新。', Conflict)
        return json.loads(op.result_json)
    result = run()
    op.result_json = encode(result)
    save(op)
    return result


def read_inquiry(name, lock=False):
    require_user()
    # Lock before loading; all writers lock the root, including files and tasks.
    doc = frappe.get_doc('JN Inquiry', name, for_update=lock)
    if not accessible(doc):
        frappe.throw('无权访问这笔询价。', frappe.PermissionError)
    return doc


def check_revision(doc, expected):
    try:
        value = int(expected)
    except (ValueError, TypeError):
        frappe.throw('缺少记录版本，请刷新页面。', Conflict)
    if value != doc.revision:
        frappe.throw('记录已被其他操作更新，请刷新后核对再提交；当前输入尚未保存。', Conflict)


def require_open(doc):
    if doc.status != '协作中':
        frappe.throw('询价已归档，请先恢复协作。', Conflict)


def bump(doc):
    doc.revision += 1
    save(doc)


def event(doc, action, summary, target=None, details=None):
    return insert('JN Activity', record_id=identifier('EV'), inquiry=doc.name,
                  actor=frappe.session.user, action=action, summary=summary,
                  target_type=target.doctype if target else doc.doctype,
                  target_id=target.name if target else doc.name, details_json=encode(details or {}))


def text(value, label, maximum=140, required=False):
    if value is None:
        value = ''
    if not isinstance(value, str):
        frappe.throw(label + '必须是文本。')
    value = value.strip()
    if (required and not value) or len(value) > maximum:
        frappe.throw(f'{label}不能为空且不超过 {maximum} 字。' if required else f'{label}不超过 {maximum} 字。')
    return value


def inquiry_data(data, current=None):
    if not isinstance(data, dict):
        frappe.throw('询价内容格式无效。')
    allowed = {'title', 'business_type', 'customer_name', 'department', 'collaborator', 'expected_date', 'notes', 'items'}
    if set(data) - allowed:
        frappe.throw('包含不允许修改的询价字段。')
    values = {key: text(data.get(key), label, required=True) for key, label in
              (('title', '询价名称'), ('customer_name', '客户名称'))}
    values['business_type'] = data.get('business_type')
    if values['business_type'] not in ('成套', '钣金'):
        frappe.throw('请选择成套或钣金。')
    values['department'] = data.get('department', 'SALES')
    if not frappe.db.exists('JN Department', values['department']):
        frappe.throw('负责部门不存在。')
    collaborator = data.get('collaborator') or None
    if collaborator:
        if not frappe.db.get_value('User', collaborator, 'enabled') or 'JN Technical' not in frappe.get_roles(collaborator):
            frappe.throw('协作者需要是已启用的技术账号。')
    if current and collaborator != current.collaborator:
        active = frappe.get_all('JN Work Task', filters={'inquiry': current.name, 'status': ['!=', '已完成']}, fields=['assigned_to'])
        if any(t.assigned_to not in (current.responsible, collaborator) for t in active):
            frappe.throw('原协作者仍有未完成任务，请先完成任务再调整访问范围。', Conflict)
    values['collaborator'] = collaborator
    values['notes'] = text(data.get('notes'), '需求说明', 6000)
    expected = data.get('expected_date') or None
    if isinstance(expected, date):
        expected = expected.isoformat()
    if expected:
        try:
            date.fromisoformat(expected)
        except (TypeError, ValueError):
            frappe.throw('期望交期格式无效。')
    values['expected_date'] = expected
    rows = data.get('items', [])
    if not isinstance(rows, list) or not 1 <= len(rows) <= 100:
        frappe.throw('请填写 1 至 100 个产品行。')
    existing = {r.line_id for r in current.get('items')} if current else set()
    seen = set()
    items = []
    for row in rows:
        if not isinstance(row, dict) or set(row) - {'line_id', 'product_name', 'quantity', 'unit', 'specification'}:
            frappe.throw('产品行格式无效。')
        line_id = row.get('line_id') or uuid.uuid4().hex
        if row.get('line_id') and line_id not in existing:
            frappe.throw('产品行标识不属于当前询价。')
        if line_id in seen:
            frappe.throw('产品行标识重复。')
        seen.add(line_id)
        try:
            quantity = float(row.get('quantity'))
        except (TypeError, ValueError):
            frappe.throw('产品数量必须是正数。')
        if not math.isfinite(quantity) or not 0 < quantity <= 100000000 or round(quantity, 3) <= 0:
            frappe.throw('产品数量必须大于 0 且不超过一亿。')
        items.append(dict(line_id=line_id, product_name=text(row.get('product_name'), '产品名称', required=True),
                          quantity=round(quantity, 3), unit=text(row.get('unit'), '单位', 20, True),
                          specification=text(row.get('specification'), '规格说明', 2000)))
    values['items'] = items
    return values


def create_inquiry(data, request_id):
    require_user()
    if not can_create():
        frappe.throw('当前技术角色通过任务参与协作，新建询价由销售或管理员执行。', frappe.PermissionError)
    def action():
        values = inquiry_data(data)
        doc = insert('JN Inquiry', record_id=identifier('JN-I'), responsible=frappe.session.user,
                     status='协作中', revision=1, is_demo=1, **values)
        event(doc, 'inquiry.created', '新建询价', details={'revision': 1})
        return {'name': doc.name}
    return command('inquiry.create', request_id, data, action)


def update_inquiry(name, expected_revision, data, request_id):
    preview = read_inquiry(name)
    if not editable(preview):
        frappe.throw('仅负责人或管理员可以修改询价内容。', frappe.PermissionError)
    def action():
        doc = read_inquiry(name, lock=True)
        check_revision(doc, expected_revision)
        require_open(doc)
        before = inquiry_snapshot(doc)
        doc.update(inquiry_data(data, current=doc))
        bump(doc)
        event(doc, 'inquiry.updated', '更新询价内容或访问范围', details={'before': before, 'after': inquiry_snapshot(doc)})
        return {'name': doc.name, 'revision': doc.revision}
    return command('inquiry.update', request_id, [name, expected_revision, data], action)


def change_status(name, expected_revision, status, request_id):
    doc = read_inquiry(name)
    if not editable(doc):
        frappe.throw('仅负责人或管理员可以归档和恢复。', frappe.PermissionError)
    if status not in ('协作中', '已归档'):
        frappe.throw('状态无效。')
    def action():
        doc = read_inquiry(name, lock=True)
        check_revision(doc, expected_revision)
        if doc.status == status:
            return {'name': name, 'revision': doc.revision}
        if status == '已归档' and frappe.db.exists('JN Work Task', {'inquiry': name, 'status': ['!=', '已完成']}):
            frappe.throw('仍有未完成任务，不能归档。', Conflict)
        if status == '已归档' and frappe.db.exists('JN AI Run', {'inquiry': name, 'status': ['in', ['排队中', '运行中', '待审核', '结果待核对']]}):
            frappe.throw('仍有未处理的模拟运行，请先审核或取消后归档。', Conflict)
        doc.status = status
        bump(doc)
        event(doc, 'inquiry.status', '归档询价' if status == '已归档' else '恢复协作')
        return {'name': name, 'revision': doc.revision}
    return command('inquiry.status', request_id, [name, expected_revision, status], action)


def safe_filename(name):
    name = str(name or '').replace('\\', '/').rsplit('/', 1)[-1]
    name = re.sub(r'[\x00-\x1f<>:"|?*]', '_', name).strip('. ')[:120]
    return name or '未命名资料.txt'


def store_private(content, filename, target):
    # The system owns managed File rows. The human uploader is on the immutable
    # revision. This avoids Frappe's owner shortcut outliving revoked membership.
    return insert('File', file_name=filename, content=content, is_private=1,
                  attached_to_doctype=target.doctype, attached_to_name=target.name,
                  owner='Administrator')


def upload(name, expected_revision, request_id, filename, content, document=None, title=None, change_note=None):
    read_inquiry(name)  # recheck access even for a retry of a completed operation
    filename = safe_filename(filename)
    if PurePosixPath(filename).suffix.lower() not in FILE_TYPES:
        frappe.throw('支持 PDF、文本、CSV、Office、PNG/JPG 和 DXF 原件；不接收可执行或网页文件。')
    if not content or len(content) > MAX_UPLOAD:
        frappe.throw('文件不能为空且单个不超过 10 MB。')
    digest = hashlib.sha256(content).hexdigest()
    title = text(title or filename, '资料名称', 140, True)
    note = text(change_note, '版本说明', 1000)
    def action():
        inquiry = read_inquiry(name, lock=True)
        check_revision(inquiry, expected_revision)
        require_open(inquiry)
        if document:
            doc = frappe.get_doc('JN Document', document)
            if doc.inquiry != name:
                frappe.throw('资料不属于此询价。', frappe.PermissionError)
            current = frappe.get_doc('JN File Revision', {'document': doc.name, 'version_number': doc.current_version})
            if current.sha256 == digest:
                return {'document': doc.name, 'revision': current.name, 'version': doc.current_version, 'duplicate': True}
        else:
            doc = insert('JN Document', record_id=identifier('DOC'), inquiry=name, title=title, current_version=0)
        number = doc.current_version + 1
        revision = insert('JN File Revision', record_id=identifier('REV'), inquiry=name, document=doc.name,
                          version_number=number, version_key=doc.name + ':' + str(number), filename=filename,
                          sha256=digest, file_size=len(content), uploaded_by=frappe.session.user, change_note=note)
        file = store_private(content, filename, revision)
        frappe.db.set_value('JN File Revision', revision.name, 'file', file.name, update_modified=False)
        doc.current_version = number
        save(doc)
        bump(inquiry)
        event(inquiry, 'document.version', f'保存资料「{doc.title}」第 {number} 版', target=revision,
              details={'document': doc.name, 'version': number, 'sha256': digest, 'filename': filename, 'change_note': note})
        return {'document': doc.name, 'revision': revision.name, 'version': number, 'duplicate': False}
    return command('document.upload', request_id, [name, expected_revision, filename, digest, document, title, note], action)


def create_task(name, expected_revision, title, description, assigned_to, request_id):
    preview = read_inquiry(name)
    if not editable(preview):
        frappe.throw('任务由询价负责人分派。', frappe.PermissionError)
    title = text(title, '任务标题', 140, True)
    description = text(description, '任务说明', 4000)
    def action():
        doc = read_inquiry(name, lock=True)
        check_revision(doc, expected_revision)
        require_open(doc)
        if assigned_to not in (doc.responsible, doc.collaborator):
            frappe.throw('处理人必须在这笔询价的访问范围内。')
        task = insert('JN Work Task', record_id=identifier('TASK'), inquiry=name, title=title, description=description,
                      assigned_to=assigned_to, status='待处理', revision=1)
        bump(doc)
        event(doc, 'task.created', '分派任务：' + title, target=task, details={'assigned_to': assigned_to, 'description': description})
        return {'name': task.name}
    return command('task.create', request_id, [name, expected_revision, title, description, assigned_to], action)


def task_action(name, expected_revision, task_name, action, reply, request_id):
    read_inquiry(name)
    reply = text(reply, '处理说明', 4000)
    def perform():
        doc = read_inquiry(name, lock=True)
        check_revision(doc, expected_revision)
        require_open(doc)
        task = frappe.get_doc('JN Work Task', task_name)
        if task.inquiry != name:
            frappe.throw('任务不属于此询价。', frappe.PermissionError)
        before = {'status': task.status, 'reply': task.reply}
        if action == 'reply':
            if task.assigned_to != frappe.session.user and not manager():
                frappe.throw('仅任务处理人可以提交回复。', frappe.PermissionError)
            if task.status != '待处理' or not reply:
                frappe.throw('待处理任务需要填写回复后提交。', Conflict)
            task.reply, task.status = reply, '待确认'
        else:
            if not editable(doc):
                frappe.throw('确认、退回和挂起恢复由询价负责人执行。', frappe.PermissionError)
            if action == 'confirm' and task.status == '待确认':
                task.status = '已完成'
            elif action == 'return' and task.status == '待确认' and reply:
                task.status = '待处理'
            elif action == 'hold' and task.status in ('待处理', '待确认') and reply:
                task.held_from, task.status = task.status, '已挂起'
            elif action == 'resume' and task.status == '已挂起':
                task.status, task.held_from = task.held_from or '待处理', ''
            else:
                frappe.throw('当前状态不支持此动作；退回或挂起需要填写原因。', Conflict)
        task.revision += 1
        save(task)
        bump(doc)
        labels = {'reply': '回复任务', 'confirm': '确认完成', 'return': '退回补充', 'hold': '挂起任务', 'resume': '恢复任务'}
        event(doc, 'task.' + action, labels[action] + '：' + task.title, target=task,
              details={'before': before, 'after': {'status': task.status, 'reply': task.reply}, 'note': reply})
        return {'name': task.name, 'status': task.status}
    return command('task.' + action, request_id, [name, expected_revision, task_name, action, reply], perform)


def inquiry_snapshot(doc):
    fields = ('name', 'title', 'business_type', 'customer_name', 'department', 'responsible', 'collaborator',
              'status', 'revision', 'expected_date', 'notes', 'is_demo', 'creation', 'modified')
    result = {k: doc.get(k) for k in fields}
    result['items'] = [{k: row.get(k) for k in ('line_id', 'product_name', 'quantity', 'unit', 'specification')} for row in doc.get('items')]
    return result


def apply_reviewed_fields(doc, changes):
    """Called only inside the AI review transaction after version/evidence checks."""
    if not editable(doc) or set(changes) - {'customer_name', 'expected_date', 'notes'}:
        frappe.throw('不允许写入这些字段。', frappe.PermissionError)
    data = {key: doc.get(key) for key in ('title', 'business_type', 'customer_name', 'department', 'collaborator', 'expected_date', 'notes')}
    data['items'] = inquiry_snapshot(doc)['items']
    data.update(changes)
    doc.update(inquiry_data(data, current=doc))
    bump(doc)


def detail(name):
    doc = read_inquiry(name)
    result = inquiry_snapshot(doc)
    result['can_edit'] = editable(doc)
    result['people'] = {user: frappe.db.get_value('User', user, 'full_name') for user in
                        (doc.responsible, doc.collaborator) if user}
    result['documents'] = frappe.get_all('JN Document', filters={'inquiry': name}, fields=['name', 'title', 'current_version'], order_by='creation asc')
    revisions = frappe.get_all('JN File Revision', filters={'inquiry': name},
                              fields=['name', 'document', 'version_number', 'filename', 'sha256', 'file_size', 'uploaded_by', 'change_note', 'creation'], order_by='version_number desc')
    for document in result['documents']:
        document['versions'] = [r for r in revisions if r.document == document.name]
    result['tasks'] = frappe.get_all('JN Work Task', filters={'inquiry': name}, fields=['name', 'title', 'description', 'assigned_to', 'status', 'reply', 'held_from', 'revision', 'creation'], order_by='creation desc')
    result['activities'] = frappe.get_all('JN Activity', filters={'inquiry': name}, fields=['name', 'actor', 'action', 'summary', 'details_json', 'creation'], order_by='creation desc')
    result['exports'] = frappe.get_all('JN Export', filters={'inquiry': name}, fields=['name', 'inquiry_revision', 'sha256', 'requested_by', 'creation'], order_by='creation desc')
    return result


def export_bundle(name, expected_revision, request_id):
    read_inquiry(name)
    def action():
        doc = read_inquiry(name, lock=True)
        check_revision(doc, expected_revision)
        snapshot = detail(name)
        from jingneng.ai import service as ai
        snapshot['ai_runs'] = [ai.detail(run_name) for run_name in frappe.get_all('JN AI Run', filters={'inquiry': name}, pluck='name', order_by='creation desc')]
        rows = frappe.get_all('JN File Revision', filters={'inquiry': name}, fields=['name', 'document', 'version_number', 'filename', 'sha256', 'file_size', 'file'], order_by='creation asc')
        if sum(row.file_size for row in rows) > MAX_EXPORT:
            frappe.throw('当前本机演示导出限制为 50 MB 原件，请减少资料量后重试。')
        manifest = {'schema': 'jingneng.f1.bundle.v1', 'inquiry': name, 'inquiry_revision': doc.revision,
                    'exported_by': frappe.session.user, 'is_demo': True, 'files': []}
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('inquiry.json', encode(snapshot).encode('utf-8'))
            for row in rows:
                content = frappe.get_doc('File', row.file).get_content()
                if isinstance(content, str):
                    content = content.encode()
                if hashlib.sha256(content).hexdigest() != row.sha256:
                    frappe.throw('原件摘要不一致，停止导出并保留现场。', Conflict)
                path = f'files/{row.document}/v{row.version_number}/{safe_filename(row.filename)}'
                archive.writestr(path, content)
                manifest['files'].append({'path': path, 'revision': row.name, 'sha256': row.sha256, 'bytes': len(content)})
            archive.writestr('manifest.json', encode(manifest).encode('utf-8'))
            archive.writestr('README.txt', '京能协作演示资料包。inquiry.json 是导出时快照，manifest.json 对应各版原件与 SHA-256。包含虚构演示资料；不是数据库备份。'.encode('utf-8'))
        content = buffer.getvalue()
        export = insert('JN Export', record_id=identifier('EXP'), inquiry=name, inquiry_revision=doc.revision,
                        requested_by=frappe.session.user, manifest_json=encode(manifest), sha256=hashlib.sha256(content).hexdigest())
        file = store_private(content, f'{name}-r{doc.revision}.zip', export)
        frappe.db.set_value('JN Export', export.name, 'file', file.name, update_modified=False)
        event(doc, 'inquiry.exported', f'导出资料包（记录版本 {doc.revision}）', target=export,
              details={'sha256': export.sha256, 'file_versions': len(rows)})
        return {'name': export.name, 'inquiry_revision': doc.revision, 'sha256': export.sha256}
    return command('inquiry.export', request_id, [name, expected_revision], action)
