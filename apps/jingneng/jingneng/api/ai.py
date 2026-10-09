"""Authenticated transport only. No arbitrary tools, SQL, models or prompts."""
import frappe
from jingneng.ai import service


@frappe.whitelist(methods=['POST'])
def start(name, expected_revision, revisions, request_id, scenario='normal'):
    return service.start(name, expected_revision, frappe.parse_json(revisions), scenario, request_id)


@frappe.whitelist(methods=['GET'])
def runs(name):
    return service.list_runs(name)


@frappe.whitelist(methods=['GET'])
def detail(name):
    return service.detail(name)


@frappe.whitelist(methods=['POST'])
def control(name, action, request_id):
    return service.control(name, action, request_id)


@frappe.whitelist(methods=['POST'])
def review(name, expected_revision, decision, changes, reason, request_id):
    return service.review(name, expected_revision, decision, frappe.parse_json(changes), reason, request_id)
