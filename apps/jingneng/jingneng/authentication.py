"""Keep concurrent sign-ins from racing over the same session metadata row."""
import frappe


def serialize_login_metadata(login_manager):
    # Lock before credentials are read: a later lock can already be stale under
    # MariaDB snapshot isolation. Frappe still authenticates and enforces policies.
    # The existing session-start commit (or error rollback) releases the row.
    identifier = frappe.form_dict.get('usr')
    if not isinstance(identifier, str) or not identifier:
        return
    user = frappe.qb.DocType('User')
    (frappe.qb.from_(user).select(user.name)
     .where(user.name == identifier).for_update().run())
