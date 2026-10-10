import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QuoteHandoff from '../components/presales/QuoteHandoff';
import PresalesWorkspace from '../components/PresalesWorkspace';
import { readDraft, writeDraft, clearDraft } from '../ui/sessionDraft';
import { readListContext, saveListContext } from '../ui/listContext';
import { bindDocumentContinuity } from '../ui/documentContinuity';
import { bindSalesNavigation } from '../ui/salesNavigation';

const data={record:{id:45,revision:3,title:'虚构成套需求',kind:'cabinet',requirements:'人工核对过的虚构要求'},documents:[{id:8,versions:[{id:18,version:2,filename:'虚构资料.txt'}]}]};
const options={company:{id:3,label:'虚构客户',url:'/companies/3'},contacts:[{id:1,label:'虚构联系人'}],addresses:[{id:2,label:'演示地址'}],conditions:[{id:3,label:'演示条件'}],methods:[{id:4,label:'演示方式'}],deliveries:[{id:5,label:'演示交付'}]};
beforeEach(()=>{sessionStorage.clear();vi.restoreAllMocks();document.head.innerHTML='<meta name="workspace-user" content="51">';});
function form(props={}){const mutate=vi.fn().mockResolvedValue(null),onDone=vi.fn();render(<QuoteHandoff data={data} api={vi.fn().mockResolvedValue(options)} mutate={mutate} onDone={onDone} onClose={()=>{}} onDirty={()=>{}} {...props}/>);return {mutate,onDone};}
async function fill(){await screen.findByLabelText('客户联系人');for(const [name,value] of [['客户联系人','1'],['客户地址','2'],['付款条件','3'],['付款方式','4'],['交付方式','5']])fireEvent.change(screen.getByLabelText(name),{target:{value}});fireEvent.change(screen.getByLabelText('确认说明'),{target:{value:'已核对虚构原件'}});fireEvent.click(screen.getByLabelText('已核对本次需求与所选资料，作为报价草稿依据'));}

describe('销售连续操作',()=>{
    it('retains the originating customer while loading and normalizing the inquiry URL',async()=>{
        history.replaceState({},'', '/presales?new=1&company=3');
        vi.spyOn(globalThis,'fetch').mockImplementation(async url=>({ok:true,json:async()=>String(url).includes('/companies')?[{id:3,label:'虚构客户',code:'TEST'}]:{items:[],total:0}}));
        const view=render(<PresalesWorkspace base="/presales"/>);
        await screen.findByRole('option',{name:'虚构客户 · TEST'});
        expect(screen.getByRole('combobox',{name:'选择客户档案'})).toHaveValue('3');
        expect(location.search).not.toContain('company=');
        view.unmount();history.replaceState({},'', '/');
    });
    it('keeps primary tabs visible, moves secondary links without changing targets, and refreshes line totals',()=>{
        document.body.innerHTML='<ul data-jn-sales-tabs="#Quote #Lines #Documents"><li><a data-toggle="tab" href="#Quote">信息</a></li><li><a data-toggle="tab" href="#Lines">报价行 (0)</a></li><li><a data-toggle="tab" href="#Charts">图表</a></li></ul>';
        bindSalesNavigation();expect(document.querySelector('.dropdown-menu a').getAttribute('href')).toBe('#Charts');expect(document.querySelector('a[href="#Quote"]').closest('.dropdown-menu')).toBeNull();window.dispatchEvent(new CustomEvent('jn-lines-count',{detail:{count:2}}));expect(screen.getByRole('link',{name:'报价行 (2)'})).toHaveAttribute('href','#Lines');
    });
    it('restores the customer detail tab from its fragment without changing another panel',()=>{
        history.replaceState({},'', '/companies/3#Company');document.body.innerHTML='<ul data-jn-sales-tabs="#Company"><li><a class="active" href="#Dashboard" data-toggle="tab">概览</a></li><li><a href="#Company" data-toggle="tab">详情</a></li></ul><div><div id="Dashboard" class="tab-pane active"></div><div id="Company" class="tab-pane"></div></div>';
        bindSalesNavigation();expect(document.getElementById('Company')).toHaveClass('active');expect(document.getElementById('Dashboard')).not.toHaveClass('active');history.replaceState({},'', '/');
    });
    it('requires explicit confirmation and sends the exact original version without price invention',async()=>{
        const {mutate}=form();await screen.findByLabelText('客户联系人');expect(screen.getByRole('button',{name:'生成并打开草稿'})).toBeDisabled();await fill();fireEvent.submit(screen.getByLabelText('确认说明').closest('form'));
        await waitFor(()=>expect(mutate).toHaveBeenCalledOnce());const body=mutate.mock.calls[0][1];expect(body.version_ids).toEqual([18]);expect(body.revision).toBe(3);expect(body.confirmed).toBe(true);expect(body).not.toHaveProperty('selling_price');
        expect(screen.getByLabelText('确认说明')).toHaveValue('已核对虚构原件'); // failed response preserves input
    });
    it('clears only the completed quotation draft after receiving a receipt',async()=>{
        const mutate=vi.fn().mockResolvedValue({quote_id:7,url:'/quotes/7'});const {onDone}=form({mutate});await fill();expect(readDraft('quote.45',3)).not.toBeNull();fireEvent.submit(screen.getByLabelText('确认说明').closest('form'));await waitFor(()=>expect(onDone).toHaveBeenCalled());expect(readDraft('quote.45',3)).toBeNull();
    });
    it('restores same-revision inputs but requires confirmation again',async()=>{
        writeDraft('quote.45',3,{note:'已保存草稿',confirmed:true,version_ids:[18]});form();await screen.findByText('已恢复本标签页草稿，请重新确认报价依据。');expect(screen.getByLabelText('确认说明')).toHaveValue('已保存草稿');expect(screen.getByLabelText('已核对本次需求与所选资料，作为报价草稿依据')).not.toBeChecked();
    });
    it('separates accounts, revisions, and expired drafts',()=>{
        writeDraft('inquiry.1',2,{title:'草稿'});expect(readDraft('inquiry.1',3)).toBeNull();document.querySelector('meta').content='52';expect(readDraft('inquiry.1',2)).toBeNull();document.querySelector('meta').content='51';expect(readDraft('inquiry.1',2)).toEqual({title:'草稿'});vi.spyOn(Date,'now').mockReturnValue(Date.now()+86400001);expect(readDraft('inquiry.1',2)).toBeNull();clearDraft('inquiry.1');
    });
    it('keeps embedded customer lists separate from the full list and from another account',()=>{
        saveListContext('QuotesIndex.all',{page:4,search:'柜体'});saveListContext('QuotesIndex.3',{page:2,search:'配件'});expect(readListContext('QuotesIndex.all').page).toBe(4);document.querySelector('meta').content='52';expect(readListContext('QuotesIndex.all')).toEqual({});
    });
    it('keeps document inputs on validation failure and blocks simultaneous submissions',async()=>{
        document.body.innerHTML='<form action="/quotes/edit/1" data-jn-continuity-form data-jn-revision="v1"><input name="label" value="原值"><div class="card-footer"><button type="submit">保存</button></div></form>';
        let resolve;const fetcher=vi.spyOn(globalThis,'fetch').mockReturnValue(new Promise(done=>resolve=done));bindDocumentContinuity();const element=document.querySelector('form');const input=element.querySelector('input');fireEvent.input(input,{target:{value:'修改后的值'}});fireEvent.submit(element);fireEvent.submit(element);expect(fetcher).toHaveBeenCalledOnce();expect(element.querySelector('button')).toBeDisabled();resolve({ok:false,status:422,json:async()=>({errors:{label:['名称格式有误']}})});await waitFor(()=>expect(element.querySelector('button')).not.toBeDisabled());expect(input.value).toBe('修改后的值');expect(element.querySelector('[role=alert]').textContent).toBe('名称格式有误');
    });
    it('restores a document draft only when the server version matches',()=>{
        writeDraft('document./quotes/edit/1','v1',[{name:'label',type:'text',value:'旧草稿'}]);document.body.innerHTML='<form action="/quotes/edit/1" data-jn-continuity-form data-jn-revision="v2"><input name="label" value="新服务端值"><div class="card-footer"></div></form>';bindDocumentContinuity();expect(document.querySelector('input').value).toBe('新服务端值');expect(screen.queryByRole('button',{name:'恢复草稿'})).not.toBeInTheDocument();
    });
});
