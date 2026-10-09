"""Stable demo identifiers; never replace files, passwords or user edits."""
import frappe
from jingneng.workbench import service as svc


def seed_workbench():
    for user, role in (('sales.demo@example.invalid', 'JN Sales'), ('tech.demo@example.invalid', 'JN Technical')):
        account = frappe.get_doc('User', user)
        if role not in [row.role for row in account.roles]:
            account.append('roles', {'role': role})
            account.save()
    for key, kind, product in (('DEMO-INQ-CT-001', '成套', 'DEMO 配电柜'), ('DEMO-INQ-BJ-001', '钣金', 'DEMO 控制箱壳体')):
        if frappe.db.exists('JN Inquiry', key):
            continue
        doc = svc.insert('JN Inquiry', record_id=key, title=f'DEMO · {kind}协作样例', business_type=kind,
                         customer_name='DEMO 示例客户', department='SALES', responsible='sales.demo@example.invalid',
                         collaborator='tech.demo@example.invalid', status='协作中', revision=1, is_demo=1,
                         notes='虚构演示资料。可上传原件、分派问题、回复并确认，不代表企业实际字段或报价规则。',
                         items=[{'line_id': key + '-L1', 'product_name': product, 'quantity': 10, 'unit': '台', 'specification': '示例规格，待人工补充'}])
        svc.event(doc, 'inquiry.seeded', '初始化演示询价')
