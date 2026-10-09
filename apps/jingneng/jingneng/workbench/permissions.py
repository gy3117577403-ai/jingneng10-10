"""One record boundary shared by our API, Frappe REST/list and file download."""
import frappe

TYPES = ('JN Inquiry', 'JN Document', 'JN File Revision', 'JN Work Task', 'JN Activity', 'JN Export')


def manager(user=None):
    user = user or frappe.session.user
    return user == 'Administrator' or 'System Manager' in frappe.get_roles(user)


def accessible(inquiry, user=None):
    user = user or frappe.session.user
    if user == 'Guest':
        return False
    if manager(user):
        return True
    row = inquiry if hasattr(inquiry, 'responsible') else frappe.db.get_value(
        'JN Inquiry', inquiry, ['responsible', 'collaborator'], as_dict=True)
    return bool(row and user in (row.responsible, row.collaborator))


def has_permission(doc, ptype=None, user=None, **kwargs):
    if ptype not in ('read', 'select', 'print', 'export', 'report'):
        return False
    return accessible(doc if doc.doctype == 'JN Inquiry' else doc.inquiry, user)


def query_for(doctype, user=None):
    user = user or frappe.session.user
    if manager(user):
        return ''
    if user == 'Guest':
        return '1=0'
    value = frappe.db.escape(user)
    clause = f'(i.responsible={value} or i.collaborator={value})'
    if doctype == 'JN Inquiry':
        return f'(`tabJN Inquiry`.responsible={value} or `tabJN Inquiry`.collaborator={value})'
    return f'`tab{doctype}`.inquiry in (select i.name from `tabJN Inquiry` i where {clause})'


def inquiry_query(user=None): return query_for('JN Inquiry', user)
def document_query(user=None): return query_for('JN Document', user)
def revision_query(user=None): return query_for('JN File Revision', user)
def task_query(user=None): return query_for('JN Work Task', user)
def activity_query(user=None): return query_for('JN Activity', user)
def export_query(user=None): return query_for('JN Export', user)


def file_query(user=None):
    """Frappe's File listing also needs record-level filtering of metadata."""
    user = user or frappe.session.user
    if manager(user):
        return ''
    value = frappe.db.escape(user)
    roots = f'select i.name from `tabJN Inquiry` i where i.responsible={value} or i.collaborator={value}'
    managed = ','.join(frappe.db.escape(name) for name in TYPES)
    clauses = [f'coalesce(`tabFile`.attached_to_doctype, "") not in ({managed})']
    for doctype in TYPES:
        names = roots if doctype == 'JN Inquiry' else f'select name from `tab{doctype}` where inquiry in ({roots})'
        clauses.append(f'(`tabFile`.attached_to_doctype={frappe.db.escape(doctype)} and `tabFile`.attached_to_name in ({names}))')
    return '(' + ' or '.join(clauses) + ')'


def protected_file(doc):
    if doc.attached_to_doctype in TYPES:
        return True
    if not doc.is_new():
        return frappe.db.get_value('File', doc.name, 'attached_to_doctype') in TYPES
    return False


def guard_file(doc, method=None):
    if protected_file(doc) and not getattr(frappe.flags, 'jn_service_write', False):
        frappe.throw('资料文件需经版本服务操作，不能改成公开文件、解绑或删除。', frappe.PermissionError)


def guard_share(doc, method=None):
    managed = doc.share_doctype in TYPES
    if doc.share_doctype == 'File':
        managed = frappe.db.get_value('File', doc.share_name, 'attached_to_doctype') in TYPES
    if managed:
        frappe.throw('请通过询价协作者设置访问范围，不单独分享记录或文件。', frappe.PermissionError)
