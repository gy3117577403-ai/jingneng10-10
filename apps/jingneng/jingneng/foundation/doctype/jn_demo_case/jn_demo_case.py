import frappe
from frappe.model.document import Document


class JNDemoCase(Document):
    def validate(self):
        if not self.code.startswith("DEMO-"):
            frappe.throw("本阶段只允许以 DEMO- 开头的演示记录。")
        self.is_demo = 1
