"""HTTP adapters; authorization and mutations live in the shared service."""
import hashlib
import json
import frappe
from jingneng.workbench import service as svc


@frappe.whitelist(methods=['GET'])
def bootstrap():
    svc.require_user()
    technicians = frappe.get_all('Has Role', filters={'role': 'JN Technical', 'parenttype': 'User'}, pluck='parent')
    people = frappe.get_all('User', filters={'enabled': 1, 'name': ['in', technicians + [frappe.session.user]]}, fields=['name', 'full_name'])
    return {'user': frappe.session.user, 'full_name': frappe.db.get_value('User', frappe.session.user, 'full_name'),
            'can_create': svc.can_create(), 'people': people,
            'departments': frappe.get_list('JN Department', fields=['name', 'department_name'], order_by='name'),
            'ai_mode': 'simulation', 'is_demo': True, 'can_manage': svc.manager(), 'version': '0.3.0'}


@frappe.whitelist(methods=['GET'])
def inquiries(q='', business_type='', status='协作中', page=1, sort='updated', scope='all'):
    svc.require_user()
    q = svc.text(q, '搜索内容', 100)
    try:
        page = max(1, min(int(page), 10000))
    except (ValueError, TypeError):
        frappe.throw('页码无效。')
    filters = {}
    orders = {'updated': 'modified desc, name asc', 'delivery': 'expected_date asc, modified desc',
              'name': 'title asc, name asc'}
    if sort not in orders or scope not in ('all', 'mine', 'collaborating'):
        frappe.throw('筛选或排序方式无效。')
    if scope == 'mine':
        filters['responsible'] = frappe.session.user
    elif scope == 'collaborating':
        filters['collaborator'] = frappe.session.user
    if business_type:
        if business_type not in ('成套', '钣金'):
            frappe.throw('业务类型无效。')
        filters['business_type'] = business_type
    if status:
        if status not in ('协作中', '已归档'):
            frappe.throw('状态无效。')
        filters['status'] = status
    or_filters = {key: ['like', '%' + q + '%'] for key in ('title', 'customer_name', 'name')} if q else None
    args = dict(filters=filters, or_filters=or_filters)
    rows = frappe.get_list('JN Inquiry', **args, fields=['name', 'title', 'business_type', 'customer_name', 'responsible', 'collaborator', 'status', 'revision', 'expected_date', 'modified'],
                           order_by=orders[sort], start=(page - 1) * 20, page_length=20)
    counts = frappe.get_list('JN Inquiry', **args, fields=[{'COUNT': 'name', 'as': 'total'}], order_by='', page_length=1)
    participants = list({row[field] for row in rows for field in ('responsible', 'collaborator') if row[field]})
    names = dict(frappe.get_all('User', filters={'name': ['in', participants]}, fields=['name', 'full_name'], as_list=True)) if participants else {}
    for row in rows:
        row['responsible_name'] = names.get(row.responsible, row.responsible)
        row['collaborator_name'] = names.get(row.collaborator, row.collaborator)
    return {'rows': rows, 'page': page, 'total': counts[0].total if counts else 0}


@frappe.whitelist(methods=['GET'])
def work_items(kind='all', page=1):
    """Action inbox. Every row and count joins the same accessible inquiry root."""
    svc.require_user()
    if kind not in ('all', 'reply', 'confirm', 'ai', 'held'):
        frappe.throw('待办类型无效。')
    try:
        page = max(1, min(int(page), 10000))
    except (ValueError, TypeError):
        frappe.throw('页码无效。')
    params = {'user': frappe.session.user, 'manager': int(svc.manager()), 'limit': 30,
              'offset': (page - 1) * 30, 'kind': kind}
    access = '( %(manager)s = 1 OR i.responsible = %(user)s OR i.collaborator = %(user)s )'
    owner = '( %(manager)s = 1 OR i.responsible = %(user)s )'
    assignee = '( %(manager)s = 1 OR t.assigned_to = %(user)s )'
    source = f"""
        SELECT t.name, t.inquiry, t.title, t.status, t.modified,
               i.title AS inquiry_title, i.customer_name, i.business_type,
               CASE WHEN t.status = '待处理' THEN 'reply' WHEN t.status = '待确认' THEN 'confirm' ELSE 'held' END AS kind,
               'task' AS target_type, 0 AS stale
        FROM `tabJN Work Task` t JOIN `tabJN Inquiry` i ON i.name = t.inquiry
        WHERE i.status = '协作中' AND {access} AND (
            (t.status = '待处理' AND {assignee}) OR
            (t.status = '待确认' AND {owner}) OR
            (t.status = '已挂起' AND ({assignee} OR {owner})))
        UNION ALL
        SELECT r.name, r.inquiry, '核对资料候选' AS title, r.status, r.modified,
               i.title AS inquiry_title, i.customer_name, i.business_type,
               'ai' AS kind, 'ai' AS target_type, (r.inquiry_revision != i.revision) AS stale
        FROM `tabJN AI Run` r JOIN `tabJN Inquiry` i ON i.name = r.inquiry
        WHERE i.status = '协作中' AND {access} AND (
            (r.status = '待审核' AND {owner}) OR
            (r.status IN ('失败', '结果待核对') AND ({owner} OR r.requested_by = %(user)s)))
    """
    counts = dict.fromkeys(('reply', 'confirm', 'ai', 'held'), 0)
    for row in frappe.db.sql(f'SELECT kind, COUNT(*) AS total FROM ({source}) work GROUP BY kind', params, as_dict=True):
        counts[row.kind] = row.total
    counts['all'] = sum(counts.values())
    condition = '' if kind == 'all' else 'WHERE kind = %(kind)s'
    rows = frappe.db.sql(f'SELECT * FROM ({source}) work {condition} ORDER BY modified DESC, name ASC LIMIT %(limit)s OFFSET %(offset)s', params, as_dict=True)
    return {'rows': rows, 'counts': counts, 'total': counts[kind], 'page': page}


@frappe.whitelist(methods=['GET'])
def my_tasks():
    svc.require_user()
    return frappe.get_list('JN Work Task', filters={'assigned_to': frappe.session.user, 'status': ['!=', '已完成']},
                           fields=['name', 'inquiry', 'title', 'status', 'creation'], order_by='modified desc', page_length=200)


@frappe.whitelist(methods=['GET'])
def detail(name):
    return svc.detail(name)


@frappe.whitelist(methods=['POST'])
def create_inquiry(data, request_id):
    return svc.create_inquiry(frappe.parse_json(data), request_id)


@frappe.whitelist(methods=['POST'])
def update_inquiry(name, expected_revision, data, request_id):
    return svc.update_inquiry(name, expected_revision, frappe.parse_json(data), request_id)


@frappe.whitelist(methods=['POST'])
def change_status(name, expected_revision, status, request_id):
    return svc.change_status(name, expected_revision, status, request_id)


@frappe.whitelist(methods=['POST'])
def upload(name, expected_revision, request_id, document=None, title=None, change_note=None):
    svc.read_inquiry(name)
    file = frappe.request.files.get('file')
    if file is None:
        frappe.throw('请选择文件。')
    content = file.stream.read(svc.MAX_UPLOAD + 1)
    return svc.upload(name, expected_revision, request_id, file.filename, content, document, title, change_note)


@frappe.whitelist(methods=['POST'])
def create_task(name, expected_revision, title, description, assigned_to, request_id):
    return svc.create_task(name, expected_revision, title, description, assigned_to, request_id)


@frappe.whitelist(methods=['POST'])
def task_action(name, expected_revision, task_name, action, reply, request_id):
    return svc.task_action(name, expected_revision, task_name, action, reply, request_id)


@frappe.whitelist(methods=['POST'])
def export_bundle(name, expected_revision, request_id):
    return svc.export_bundle(name, expected_revision, request_id)


def authorized_file(kind, name):
    svc.require_user()
    doctype = {'revision': 'JN File Revision', 'export': 'JN Export'}.get(kind)
    if not doctype:
        frappe.throw('下载类型无效。')
    record = frappe.get_doc(doctype, name)
    svc.read_inquiry(record.inquiry)
    file = frappe.get_doc('File', record.file)
    content = file.get_content()
    if isinstance(content, str):
        content = content.encode()
    if hashlib.sha256(content).hexdigest() != record.sha256:
        frappe.throw('文件摘要不一致，请联系管理员检查原件。', svc.Conflict)
    return record, file, content


@frappe.whitelist(methods=['GET'])
def download(kind, name):
    _, file, content = authorized_file(kind, name)
    frappe.local.response.update(type='download', filename=svc.safe_filename(file.file_name),
                                 filecontent=content, display_content_as='attachment')


@frappe.whitelist(methods=['GET'])
def preview(name):
    record, _, content = authorized_file('revision', name)
    if not record.filename.lower().endswith(('.txt', '.csv')):
        return {'supported': False, 'filename': record.filename}
    try:
        value = content[:200000].decode('utf-8-sig')
    except UnicodeDecodeError:
        return {'supported': False, 'filename': record.filename}
    return {'supported': True, 'filename': record.filename, 'text': value, 'truncated': len(content) > 200000}
