"""All business writes pass through the same validated application service."""
import frappe
from frappe.model.document import Document


class ManagedDocument(Document):
    def validate(self):
        if not getattr(frappe.flags, 'jn_service_write', False):
            frappe.throw('请通过京能工作台执行此操作。', frappe.PermissionError)

    def on_trash(self):
        frappe.throw('业务记录保留追溯历史，请使用归档。', frappe.PermissionError)


class ImmutableDocument(ManagedDocument):
    def validate(self):
        super().validate()
        if not self.is_new():
            frappe.throw('已保存的版本和操作记录不可覆盖。', frappe.PermissionError)
