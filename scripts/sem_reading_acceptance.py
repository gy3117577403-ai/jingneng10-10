"""Real private document conversion, source search and role checks; fictional inputs only."""
from datetime import datetime, timedelta
from io import BytesIO
import json
import time
from urllib.parse import urlencode
from xml.sax.saxutils import escape
from zipfile import ZipFile, ZIP_DEFLATED
from sem_data_acceptance import DataClient, OUT


def archive(files):
    stream = BytesIO()
    with ZipFile(stream, 'w', ZIP_DEFLATED) as z:
        for name, content in files.items(): z.writestr(name, content.encode('utf-8'))
    return stream.getvalue()


def word_file(second='换版前必须完成手动复核，发布后使用当前版本。'):
    ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    para = lambda text: '<w:p><w:r><w:t>' + escape(text) + '</w:t></w:r></w:p>'
    return archive({
        '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        'word/document.xml': f'<w:document xmlns:w="{ns}"><w:body>' + para('资料发布制度（虚构演示）') + para('第一条：原件保留，资料修订需要另一位审核人确认。') + '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' + para('第二条：版本与阅读') + para(second) + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>',
    })


def excel_file():
    ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    cell = lambda pos, value: f'<c r="{pos}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'
    return archive({
        '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
        '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        'xl/workbook.xml': f'<workbook xmlns="{ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="设备档案" sheetId="1" r:id="r1"/><sheet name="检查记录" sheetId="2" r:id="r2"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
        'xl/worksheets/sheet1.xml': f'<worksheet xmlns="{ns}"><dimension ref="A1:D2"/><sheetData><row r="1">'+cell('A1','设备编号')+cell('B1','名称（虚构）')+cell('C1','故障次数')+cell('D1','保存的公式结果')+'</row><row r="2">'+cell('A2','00007')+cell('B2','演示液压试验台')+'<c r="C2"><v>0</v></c><c r="D2"><f>6+6</f><v>12</v></c></row></sheetData></worksheet>',
        'xl/worksheets/sheet2.xml': f'<worksheet xmlns="{ns}"><dimension ref="A1:B2"/><sheetData><row r="1">'+cell('A1','设备编号')+cell('B1','检查要求')+'</row><row r="2">'+cell('A2','00007')+cell('B2','每三十天检查密封情况，异常时暂停使用。')+'</row></sheetData></worksheet>',
    })


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    owner = DataClient('http://127.0.0.1:8090'); owner.login_as()
    reviewer = DataClient(owner.base); reviewer.login_as('data-reviewer@jingneng.demo')
    reader = DataClient(owner.base); reader.login_as('data-reader@jingneng.demo')
    uid, approver, guest = [c.api()['user_id'] for c in [owner, reviewer, reader]]
    actions = list(owner.api('/configuration')['actions'])
    maintain = [{'principal_type': 'user', 'principal_id': u, 'action': a, 'effect': 'allow'} for u in [uid, approver] for a in actions]
    read = [{'principal_type': 'user', 'principal_id': guest, 'action': a, 'effect': 'allow'} for a in ['discover', 'view']]
    stamp = datetime.now().strftime('%Y%m%d%H%M%S'); evidence = {'checks': [], 'checked_at': datetime.now().astimezone().isoformat()}
    def passed(name): evidence['checks'].append({'name': name, 'passed': True}); print('PASS', name, flush=True)
    def rev(rid): return owner.api(f'/records/{rid}')['record']['revision']
    def publish(rid):
        owner.api(f'/records/{rid}/submit', {'revision': rev(rid), 'reviewer_id': approver, 'note': '已阅读虚构文件，提交核对'})
        reviewer.api(f'/records/{rid}/approve', {'revision': rev(rid), 'note': '已核对原文与版本，发布虚构试用资料'})
        return owner.api(f'/records/{rid}')['version']['id']
    def wait(rid, fid, expected='ready'):
        deadline = time.monotonic()+110
        while time.monotonic() < deadline:
            detail = owner.api(f'/records/{rid}'); file = next(f for f in detail['files'] if f['id']==fid)
            state = file['reading']['state']
            if state not in ['queued','processing']:
                assert state == expected, file['reading']; return detail
            time.sleep(2)
        raise AssertionError('Document processing did not finish')
    def search(q, **extra): return reader.api('/search?' + urlencode({'q': q, **extra}))
    try:
        trials = []
        for title, key, label, kind, filename, raw in [
            ('制度文件','effective','生效日期','file','资料发布制度（虚构）.docx',word_file()),
            ('设备档案','equipment','设备编号','ledger','设备档案（虚构）.xlsx',excel_file()),
        ]:
            cat = owner.api('/catalog/category/0', {'name': f'{title}试用（虚构）{stamp}', 'position': 20, 'parent_id': None, 'description': '验证阅读与协作的虚构试用分类，非企业正式制度', 'enabled': True,
                'fields': [{'key':key,'label':label,'type':'date' if key=='effective' else 'text','required':True,'options':[]}], 'rules': maintain+read})['id']
            values = {key:'2026-10-11' if key=='effective' else '00007'}
            rid = owner.api(f'/records/{cat}/create', {'category_revision':1,'code':'DEMO-READ-001','title':f'{title}阅读试用（虚构）','kind':kind,'values':values,'note':'建立虚构试用'})['id']
            (OUT/filename).write_bytes(raw)
            fid = owner.api(f'/records/{rid}/files', {'revision':rev(rid)}, file=(filename,raw))['file_id']
            detail = wait(rid,fid); version=publish(rid)
            trials.append({'id':rid,'version':version,'file':fid,'category':cat,'values':values})
            assert owner.api(f'/records/{rid}/versions/{version}/files/{fid}?download=1')==raw
            reader.api(f'/records/{rid}/versions/{version}/files/{fid}?download=1',expected=(403,))
        word,sheet=trials; evidence['trials']=trials
        hits=search('手动复核',category=word['category'])['items']; assert len(hits)==1 and hits[0]['page']==2 and hits[0]['version_id']==word['version']
        preview=reader.api(f"/records/{word['id']}/versions/{word['version']}/files/{word['file']}?page=2"); assert preview.startswith(b'\x89PNG'); (OUT/'word-page-2.png').write_bytes(preview)
        passed('真实Word转换中文分页预览，正文结果固定到第2页，原件下载独立授权')
        url=f"/records/{sheet['id']}/versions/{sheet['version']}/files/{sheet['file']}"
        view=reader.api(url); assert view['type']=='sheet' and view['rows'][1]==['00007','演示液压试验台','0','12']
        assert reader.api(url+'?page=2')['name']=='检查记录'
        hit=search('密封情况',category=sheet['category'])['items'][0]; assert hit['page']==2 and hit['row']==2
        passed('Excel两工作表、前导零、零值和已存公式结果正确，结果定位到工作表行')
        task=owner.api(f"/collaboration/{word['id']}/task",{'version_id':word['version'],'title':'补充制度说明（虚构）','description':'补充现场核对步骤，再发布新版本','due_date':(datetime.now()+timedelta(days=2)).strftime('%Y-%m-%d'),'assignee_id':approver})['id']
        reviewer.api(f'/collaboration/{task}/task-action',{'revision':1,'decision':'accept','result':'开始核对'})
        reviewer.api(f'/collaboration/{task}/task-action',{'revision':2,'decision':'complete','result':'建议改为现场核对'})
        owner.api(f"/records/{word['id']}/save", {'revision':rev(word['id']),'title':'制度文件更新试用（虚构）','values':word['values'],'file_ids':[],'note':'根据协作意见替换为新版文件'})
        nf=owner.api(f"/records/{word['id']}/files",{'revision':rev(word['id'])},file=('新版制度（虚构）.docx',word_file('换版前必须完成现场核对，新发布版替代原发布版。')))['file_id']
        wait(word['id'],nf); new=publish(word['id'])
        assert not search('手动复核',category=word['category'])['items']
        assert search('手动复核',history=1,category=word['category'])['items'][0]['historical']
        assert search('现场核对',category=word['category'])['items'][0]['version_id']==new
        passed('上传—阅读—审核—检索—补充协作—新版发布闭环，历史来源保留且不混入默认搜索')
        limited=maintain+[{'principal_type':'user','principal_id':guest,'action':a,'effect':'allow'} for a in ['discover','request']]
        owner.api(f"/catalog/policy/{word['id']}", {'revision':rev(word['id']),'mode':'custom','rules':limited})
        assert not search('现场核对',category=word['category'])['items']
        grant=reader.api(f"/collaboration/{word['id']}/request",{'days':1,'reason':'核对虚构依据','approver_id':uid})['id']
        owner.api(f'/collaboration/{grant}/access-action',{'revision':1,'decision':'approve','note':'允许临时阅读这个版本'})
        assert search('现场核对',category=word['category'])['items']
        owner.api(f'/collaboration/{grant}/access-action',{'revision':2,'decision':'revoke','note':'已完成核对'})
        assert not search('现场核对',category=word['category'])['items']
        reader.api(f"/records/{word['id']}/versions/{new}/files/{nf}?page=2",expected=(403,))
        owner.api(f"/catalog/policy/{word['id']}",{'revision':rev(word['id']),'mode':'inherit','rules':[]})
        passed('只有目录权限看不到正文摘要，临时授权可阅读，撤销后搜索和原文同时拒绝')
        bad=owner.api(f"/records/{sheet['id']}/files",{'revision':rev(sheet['id'])},file=('损坏文档（虚构）.docx',b'fictional invalid office'))['file_id']
        d=wait(sheet['id'],bad,'failed'); url=f"/records/{sheet['id']}/versions/{d['version']['id']}/files/{bad}"
        assert owner.api(url)['state']=='failed'; owner.api(url+'/retry',{}); wait(sheet['id'],bad,'failed')
        assert owner.api(url+'?download=1')==b'fictional invalid office'
        passed('损坏Office文档显示可理解的失败与重试，原件保留且不伪装成已索引')
        evidence.update(word_latest_version=new,word_latest_file=nf,task_id=task)
    finally:
        (OUT/'document-reading-http.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    main()
