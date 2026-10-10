import frappe
from jingneng.web_assets import asset_version
from jingneng.workbench.service import require_user

no_cache = 1


def get_context(context):
    if frappe.session.user == 'Guest':
        frappe.local.flags.redirect_location = '/signin'
        raise frappe.Redirect
    require_user()
    context.csrf_token = frappe.sessions.get_csrf_token()
    context.asset_version = asset_version('workbench/workbench.css', 'workbench/workbench.js')
