"""Authenticated F0 acceptance endpoints; not an AI/business task engine."""

import uuid
import frappe
from frappe.utils.background_jobs import get_redis_conn
from jingneng import __version__
from jingneng.ai import get_mode


def require_demo_access():
    frappe.only_for(['JN Demo User', 'System Manager'])


@frappe.whitelist(methods=['GET'])
def state():
    require_demo_access()
    frappe.db.sql('select 1')
    cache_ok = bool(frappe.cache.ping())
    queue_ok = bool(get_redis_conn().ping())
    return {
        'app_version': __version__, 'frappe_version': frappe.__version__,
        'environment': 'demo', 'ai_mode': get_mode(), 'user': frappe.session.user,
        'checks': {'database': True, 'cache': cache_ok, 'queue': queue_ok},
        'departments': frappe.get_list('JN Department', fields=['name', 'department_name'], order_by='name'),
        'cases': frappe.get_list('JN Demo Case', fields=['name', 'title', 'business_type', 'department', 'description'], order_by='name'),
    }


@frappe.whitelist(methods=['POST'])
def start_probe():
    require_demo_access()
    token = uuid.uuid4().hex
    frappe.cache.set_value('jn:probe:' + token, {'owner': frappe.session.user, 'status': 'queued'}, expires_in_sec=300)
    frappe.enqueue('jingneng.api.runtime.complete_probe', queue='short', token=token, enqueue_after_commit=True)
    return {'token': token, 'status': 'queued'}


def complete_probe(token):
    key = 'jn:probe:' + token
    record = frappe.cache.get_value(key)
    if record:
        record['status'] = 'completed'
        record['site'] = frappe.local.site
        frappe.cache.set_value(key, record, expires_in_sec=300)


@frappe.whitelist(methods=['GET'])
def probe_result(token):
    require_demo_access()
    if len(token) != 32 or any(c not in '0123456789abcdef' for c in token):
        frappe.throw('Invalid probe token', frappe.ValidationError)
    record = frappe.cache.get_value('jn:probe:' + token)
    if not record or record.get('owner') != frappe.session.user:
        frappe.throw('Probe not found for this user', frappe.DoesNotExistError)
    return {'status': record['status']}
