"""Small idempotent seeds. Existing user changes and passwords are preserved."""

import os
import frappe

DEPARTMENTS = (
    ('SALES', '销售与服务中心'), ('FINANCE', '财务部'), ('ADMIN', '综合管理部'),
    ('QUALITY', '品质部'), ('PLANNING', '生产计划部'), ('TECH', '技术部'),
    ('RD', '研发部'), ('PURCHASE', '采购部'), ('WAREHOUSE', '仓库'),
)


def ensure_role():
    if not frappe.db.exists('Role', 'JN Demo User'):
        frappe.get_doc({'doctype': 'Role', 'role_name': 'JN Demo User', 'desk_access': 1}).insert()


def seed_demo():
    password = os.environ.get('DEMO_PASSWORD', '')
    if len(password) < 16:
        raise ValueError('Missing generated DEMO_PASSWORD; no default password is installed.')
    # Set the site's clock before inserting demo records on a fresh site.
    settings = frappe.get_single('System Settings')
    for field, value in (('language', 'zh'), ('time_zone', 'Asia/Shanghai'), ('setup_complete', 1)):
        if settings.meta.has_field(field):
            settings.set(field, value)
    settings.save()
    frappe.clear_cache()
    ensure_role()
    for code, label in DEPARTMENTS:
        if not frappe.db.exists('JN Department', code):
            frappe.get_doc({'doctype': 'JN Department', 'code': code,
                            'department_name': label, 'is_demo': 1}).insert()
    cases = (
        ('DEMO-CT-001', '成套演示资料', '成套', 'SALES'),
        ('DEMO-BJ-001', '钣金演示资料', '钣金', 'TECH'),
    )
    for code, title, business_type, department in cases:
        if not frappe.db.exists('JN Demo Case', code):
            frappe.get_doc({'doctype': 'JN Demo Case', 'code': code, 'title': title,
                            'business_type': business_type, 'department': department,
                            'description': 'DEMO：用于验证数据保存与关联，不是真实客户订单。', 'is_demo': 1}).insert()
    for email, label in (
        ('sales.demo@example.invalid', '演示销售'),
        ('tech.demo@example.invalid', '演示技术'),
    ):
        if not frappe.db.exists('User', email):
            frappe.get_doc({'doctype': 'User', 'email': email, 'first_name': label,
                            'enabled': 1, 'user_type': 'System User', 'language': 'zh',
                            'send_welcome_email': 0, 'new_password': password,
                            'roles': [{'role': 'JN Demo User'}]}).insert()
    website = frappe.get_single('Website Settings')
    if not website.favicon:
        website.favicon = '/assets/jingneng/images/favicon.svg'
        website.save()
    frappe.db.commit()
    print('Demo initialization complete; existing records and passwords preserved.')
