import frappe
from jingneng.web_assets import asset_version

no_cache = 1


def get_context(context):
    if frappe.session.user != 'Guest':
        frappe.local.flags.redirect_location = '/workbench'
        raise frappe.Redirect
    context.csrf_token = frappe.sessions.get_csrf_token()
    context.asset_version = asset_version('workbench/workbench.css', 'css/signin.css', 'js/signin.js')
