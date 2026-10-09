app_name = "jingneng"
app_title = "京能协作"
app_publisher = "Jingneng Project"
app_description = "定制制造协作与 AI 辅助基础结构"
app_email = "demo@example.invalid"
app_license = "Proprietary"

home_page = "workbench"
before_install = "jingneng.setup.ensure_role"

permission_query_conditions = {
    'JN Inquiry': 'jingneng.workbench.permissions.inquiry_query',
    'JN Document': 'jingneng.workbench.permissions.document_query',
    'JN File Revision': 'jingneng.workbench.permissions.revision_query',
    'JN Work Task': 'jingneng.workbench.permissions.task_query',
    'JN Activity': 'jingneng.workbench.permissions.activity_query',
    'JN Export': 'jingneng.workbench.permissions.export_query',
    'JN AI Run': 'jingneng.workbench.permissions.ai_run_query',
    'JN AI Review': 'jingneng.workbench.permissions.ai_review_query',
    'File': 'jingneng.workbench.permissions.file_query',
}
has_permission = {name: 'jingneng.workbench.permissions.has_permission' for name in permission_query_conditions}
has_permission['File'] = 'jingneng.workbench.files.permission'
override_doctype_class = {'File': 'jingneng.workbench.files.WorkbenchFile'}
doc_events = {'DocShare': {'before_insert': 'jingneng.workbench.permissions.guard_share'}}

scheduler_events = {'cron': {'* * * * *': ['jingneng.ai.service.recover']}}
