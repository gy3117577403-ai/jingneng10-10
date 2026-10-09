import frappe
from frappe.core.doctype.file.file import File
from jingneng.workbench.permissions import TYPES, accessible, guard_file


def permission(doc, ptype=None, user=None, **kwargs):
    if doc.attached_to_doctype not in TYPES:
        return None
    if ptype not in ('read', 'select', 'print', 'export'):
        return False
    if doc.attached_to_doctype == 'JN Inquiry':
        inquiry = doc.attached_to_name
    else:
        inquiry = frappe.db.get_value(doc.attached_to_doctype, doc.attached_to_name, 'inquiry')
    return bool(inquiry and accessible(inquiry, user))


class WorkbenchFile(File):
    def check_max_file_size(self):
        if self.attached_to_doctype == 'JN Export' and getattr(frappe.flags, 'jn_service_write', False):
            size = len(self._content or b'')
            if size > 64 * 1024 * 1024:
                frappe.throw('导出包超过本机演示的 64 MB 限制。')
            return size
        return super().check_max_file_size()

    def before_insert(self):
        guard_file(self)
        super().before_insert()

    def validate(self):
        guard_file(self)
        super().validate()

    def on_trash(self):
        guard_file(self)
        super().on_trash()

    def is_downloadable(self):
        result = permission(self, 'read')
        return super().is_downloadable() if result is None else result
