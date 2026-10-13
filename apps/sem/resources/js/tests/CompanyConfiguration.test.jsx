import React,{useState} from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CategoryEditor from '../components/company-data/CategoryEditor';
import {GroupMembers,PermissionPreview,RulesEditor,SchemaEditor,parentChoices} from '../components/company-data/ConfigurationEditors';
import CompanyData from '../components/company-data/CompanyData';
import RecordDetail from '../components/company-data/RecordDetail';
import {LibraryTable} from '../components/company-data/LibraryRecords';
import {EditDialog} from '../components/company-data/kit';
import {confirmAction} from '../ui/confirmAction';

vi.mock('../ui/confirmAction',()=>({confirmAction:vi.fn().mockResolvedValue(false)}));
beforeEach(()=>{window.matchMedia=vi.fn().mockReturnValue({matches:false,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn()});global.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();history.replaceState(null,'','/');});
const field={key:'quantity',label:'数量',type:'number',required:true,options:[]};
const config={categories:[{id:1,name:'演示分类',parent_id:null},{id:2,name:'下级分类',parent_id:1},{id:3,name:'下下级',parent_id:2},{id:4,name:'其他分类',parent_id:null}],users:[{id:7,name:'演示维护人'},{id:8,name:'演示审核人'}],groups:[],organizations:[],actions:{discover:'查看目录',view:'查看内容',create:'新增资料',edit:'编辑草稿',submit:'提交审核',review:'审核发布',download:'下载原件',export:'导出台账',archive:'归档与恢复',collaborate:'协作与评论',request:'申请查看',access:'审批查看申请'}};
const initial={name:'',description:'',parent_id:null,position:0,enabled:true,fields:[],rules:[],record_count:0};
const response=data=>({ok:true,json:async()=>data});

describe('分类配置与授权流程',()=>{
    it.each(['分类','工作组'])('does not reopen discard confirmation while closing %s',async(kind)=>{
        let decide;confirmAction.mockClear();confirmAction.mockImplementationOnce(()=>new Promise(resolve=>{decide=resolve;}));
        const close=vi.fn();
        if(kind==='分类')render(<CategoryEditor api={{post:vi.fn()}} config={config} editor={{id:0,value:initial}} onClose={close} onSave={vi.fn()}/>);
        else render(<EditDialog title="工作组" initial={{name:''}} onClose={close} onSave={vi.fn()}>{(value,set)=><input aria-label="分类名称 *" value={value.name} onChange={event=>set({name:event.target.value})}/>}</EditDialog>);
        fireEvent.change(screen.getByLabelText('分类名称 *'),{target:{value:'暂存修改'}});
        fireEvent.click(screen.getByRole('button',{name:'取消'}));fireEvent.click(screen.getByRole('button',{name:'关闭窗口'}));
        expect(confirmAction).toHaveBeenCalledTimes(1);
        await act(async()=>decide(true));expect(close).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button',{name:'关闭窗口'}));expect(confirmAction).toHaveBeenCalledTimes(1);
    });
    it('guides required fields across steps and sends one full configuration only after review',async()=>{
        const user=userEvent.setup();
        const save=vi.fn().mockResolvedValue({id:6}),close=vi.fn();
        render(<CategoryEditor api={{post:vi.fn()}} config={config} editor={{id:0,value:initial}} onClose={close} onSave={save}/>);
        fireEvent.click(screen.getByRole('button',{name:'下一步'}));expect(screen.getByRole('alert')).toHaveTextContent('请填写分类名称');
        fireEvent.change(screen.getByLabelText('分类名称 *'),{target:{value:'演示设备台账'}});fireEvent.click(screen.getByRole('button',{name:'下一步'}));
        fireEvent.click(screen.getByRole('button',{name:'添加字段'}));fireEvent.click(screen.getByRole('button',{name:'下一步'}));expect(screen.getByRole('alert')).toHaveTextContent('字段');
        fireEvent.change(screen.getByLabelText('字段1名称'),{target:{value:'设备编号'}});fireEvent.click(screen.getByRole('button',{name:'下一步'}));
        expect(screen.getByRole('tabpanel',{name:'成员权限'})).toBeVisible();expect(save).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button',{name:'下一步'}));expect(screen.getByRole('tabpanel',{name:'核对并保存'})).toBeVisible();expect(save).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button',{name:'保存分类'}));await waitFor(()=>expect(close).toHaveBeenCalledTimes(1));
        expect(save).toHaveBeenCalledWith(expect.objectContaining({name:'演示设备台账',rules:[],fields:[expect.objectContaining({label:'设备编号'})]}));
    });
    it('keeps all edited data after a conflict and respects cancelling discard',async()=>{
        const close=vi.fn();render(<CategoryEditor api={{post:vi.fn()}} config={config} editor={{id:1,value:{...initial,name:'原分类',revision:1}}} onClose={close} onSave={vi.fn().mockRejectedValue(new Error('配置已被其他人更新'))}/>);
        fireEvent.change(screen.getByLabelText('分类名称 *'),{target:{value:'保留修改'}});fireEvent.click(screen.getByRole('button',{name:'取消'}));await waitFor(()=>expect(confirmAction).toHaveBeenCalled());expect(close).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('tab',{name:'核对并保存'}));fireEvent.click(screen.getByRole('button',{name:'保存分类'}));expect(await screen.findByRole('alert')).toHaveTextContent('其他人更新');
        fireEvent.click(screen.getByRole('tab',{name:'基本信息'}));expect(screen.getByLabelText('分类名称 *')).toHaveValue('保留修改');
    });
    it('prevents changes to used field types or removal but lets new fields be removed and reordered',()=>{
        const change=vi.fn();render(<SchemaEditor fields={[field,{...field,key:'new',label:'新字段'}]} lockedKeys={['quantity']} onChange={change}/>);
        expect(screen.getByLabelText('字段1类型')).toBeDisabled();expect(screen.getByRole('button',{name:'删除字段1'})).toBeDisabled();
        expect(screen.getByRole('button',{name:'删除字段2'})).toBeEnabled();fireEvent.click(screen.getByRole('button',{name:'上移字段2'}));expect(change.mock.calls[0][0].map(item=>item.key)).toEqual(['new','quantity']);
        expect(parentChoices(config.categories,1).map(item=>item.id)).toEqual([4]);
    });
    it('does not default an authorization to the first person or include export in maintenance presets',()=>{
        const change=vi.fn();render(<RulesEditor rules={[]} config={config} onChange={change}/>);fireEvent.click(screen.getByRole('button',{name:'添加授权对象'}));fireEvent.click(screen.getByRole('button',{name:'录入维护'}));
        const rules=change.mock.calls.at(-1)[0];expect(rules.every(rule=>rule.principal_id===0)).toBe(true);expect(rules.map(rule=>rule.action)).toEqual(['discover','view','create','edit','submit']);
    });
    it('discards an outdated permission preview when its unsaved rules change',async()=>{
        let finish;const api={post:vi.fn(()=>new Promise(resolve=>{finish=resolve;}))};
        const view=render(<PermissionPreview api={api} config={config} categoryId={1} enabled rules={[]}/>);
        fireEvent.click(screen.getByRole('combobox',{name:'权限预览成员'}));fireEvent.click(await screen.findByRole('option',{name:'演示维护人'}));fireEvent.click(screen.getByRole('button',{name:'预览权限'}));
        expect(api.post.mock.calls[0][0]).toBe('/catalog/preview');
        view.rerender(<PermissionPreview api={api} config={config} categoryId={1} enabled rules={[{principal_type:'everyone',principal_id:0,action:'view',effect:'deny'}]}/>);
        await act(async()=>finish({user:{name:'过期结果'},permissions:[],note:'旧预览'}));expect(screen.queryByText(/过期结果/)).toBeNull();
    });
    it('keeps selected members outside the active search when changing another member',()=>{
        const change=vi.fn();function Group(){const [value,set]=useState([7]);return <GroupMembers config={config} value={value} original={[7]} onChange={next=>{set(next);change(next);}}/>;}render(<Group/>);
        fireEvent.change(screen.getByLabelText('搜索工作组成员'),{target:{value:'审核'}});fireEvent.click(screen.getByRole('checkbox',{name:'演示审核人'}));expect(change).toHaveBeenLastCalledWith([7,8]);
        fireEvent.change(screen.getByLabelText('搜索工作组成员'),{target:{value:''}});expect(screen.getByRole('checkbox',{name:'演示维护人'})).toBeChecked();
    });
});

describe('台账配套流程',()=>{
    it('keeps zero and false visible and does not render values for discover-only records',()=>{
        const category={id:1,fields:[field,{key:'enabled',label:'有效',type:'boolean'}]};
        render(<LibraryTable category={category} categories={[category]} userId={7} onOpen={()=>{}} items={[{id:1,title:'公开样例',code:'DEMO',kind:'ledger',readable:true,values:{quantity:0,enabled:false}},{id:2,title:'受限样例',code:'PRIVATE',kind:'ledger',readable:false,values:{quantity:'秘密数量',enabled:true}}]}/>);
        expect(screen.getByText('0')).toBeVisible();expect(screen.getByText('否')).toBeVisible();expect(screen.queryByText('秘密数量')).toBeNull();expect(screen.getAllByText('需授权查看')).toHaveLength(2);
    });
    it('restores list filters without overwriting a source document page and carries the category into imports',async()=>{
        history.replaceState(null,'','/?category=1&kind=ledger&scope=created&sort=code&list_page=2&page=9');
        vi.stubGlobal('fetch',vi.fn(url=>Promise.resolve(response(String(url).includes('/imports')?{items:[]}:{categories:[{id:1,name:'演示分类',fields:[field],abilities:{view:true,create:true}}],items:[],total:32,page:2,pages:2,manager:true,user_id:7}))));
        render(<CompanyData endpoint="/data/api"/>);fireEvent.click(await screen.findByRole('button',{name:'导入表格'}));
        expect(await screen.findByLabelText('导入目标分类')).toHaveValue('1');expect(new URLSearchParams(location.search).get('page')).toBe('9');expect(new URLSearchParams(location.search).get('list_page')).toBe('2');
        fireEvent.click(screen.getByRole('button',{name:'返回台账列表'}));expect(screen.getByLabelText('工作范围')).toHaveValue('created');expect(screen.getByLabelText('资料排序')).toHaveValue('code');
    });
    it('renders discovery-only record details with no field snapshot in the response',async()=>{
        const detail={record:{id:1,kind:'ledger',draft_version_id:null,published_version_id:10},version:{id:10,title:'受限资料',number:1,state:'published'},readable:false,files:[],abilities:{request:false},versions:[]};
        render(<RecordDetail api={{get:vi.fn().mockResolvedValue(detail)}} selection={{id:1}} userId={7} onClose={()=>{}} onChanged={()=>{}}/>);expect(await screen.findByText('内容需要授权查看')).toBeVisible();
    });
    it('explains draft requirements before enabling submit',async()=>{
        const detail={record:{id:1,kind:'file',draft_version_id:10,published_version_id:null},version:{id:10,title:'待补充资料',number:1,state:'draft',fields:[],values:{},file_ids:[]},schema_current:false,readable:true,files:[],abilities:{submit:true,edit:true},versions:[],reviewers:[],comments:[],events:[],permissions:[]};
        render(<RecordDetail api={{get:vi.fn().mockResolvedValue(detail)}} selection={{id:1}} userId={7} onClose={()=>{}} onChanged={()=>{}}/>);
        expect(await screen.findByRole('button',{name:'提交审核'})).toBeDisabled();expect(screen.getByText(/字段配置已变化/)).toBeVisible();expect(screen.getByText(/先上传至少一份附件/)).toBeVisible();expect(screen.getByText(/暂无另一位有审核权限/)).toBeVisible();
    });
});
