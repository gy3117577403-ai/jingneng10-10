import frappe
from jingneng.workbench.service import require_user

no_cache = 1


def get_context(context):
    if frappe.session.user == 'Guest':
        frappe.local.flags.redirect_location = '/login?redirect-to=/workbench'
        raise frappe.Redirect
    require_user()
    context.csrf_token = frappe.sessions.get_csrf_token()
