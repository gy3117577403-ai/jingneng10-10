import React from 'react';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe,it,expect,vi,afterEach} from 'vitest';
import WorkInbox from '../components/WorkInbox';
import PrivateFilePreview from '../components/PrivateFilePreview';
import {navigationModel,currentModule} from '../ui/navigationModel';
import {Segments,userKey} from '../ui/WorkspaceKit';

afterEach(()=>{vi.unstubAllGlobals();document.querySelector('meta[name="workspace-user"]')?.remove();});
const quote={key:'quote:12',source:'quote',source_label:'报价',title:'虚构控制柜报价',company:'虚构客户',code:'QT-12',owner:'负责人',date:'2026-10-12',state:'待处理',tone:'info',action:'处理报价',reason:'在原业务中处理',url:'/quotes/12'};
const inquiry={...quote,key:'presales:5',source:'presales',source_label:'售前核对',title:'虚构钣金核对',detail_url:'/presales/api/inquiries/3',run_id:5,url:'/presales/inquiries/3?tab=ai&run=5&focus=1'};
const result={items:[quote,inquiry],sources:[{key:'quote',label:'报价',total:1},{key:'presales',label:'售前核对',total:1}],total:2,limit_per_source:50};
const ok=data=>({ok:true,json:async()=>data});

describe('focused work inbox',()=>{
    it('does not show a redirected login page as private document content',async()=>{
        vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,redirected:true,status:200,text:async()=>'<form>login</form>'}));
        render(<PrivateFilePreview file={{filename:'虚构资料.txt',extension:'txt',version:1,size:40}} url="/private/file" onClose={()=>{}}/>);
        expect(await screen.findByRole('alert')).toHaveTextContent('登录状态已过期');expect(screen.queryByText('<form>login</form>')).toBeNull();
    });
    it('filters real items, opens a contextual detail, preserves the list and stores attention without business writes',async()=>{
        const fetch=vi.fn().mockResolvedValue(ok(result));vi.stubGlobal('fetch',fetch);const user=userEvent.setup();render(<WorkInbox endpoint="/workspace/inbox"/>);
        await screen.findByText(quote.title);await user.click(screen.getByRole('button',{name:`关注：${quote.title}`}));
        await user.click(screen.getByRole('button',{name:'关注',exact:true}));expect(screen.queryByText(inquiry.title)).toBeNull();
        const opener=screen.getByRole('button',{name:`查看事项：${quote.title}`});await user.click(opener);
        expect(await screen.findByRole('dialog',{name:'事项详情'})).toBeVisible();expect(screen.getByRole('link',{name:'处理报价'})).toHaveAttribute('href','http://localhost:3000/quotes/12?return=inbox');
        await user.click(screen.getByRole('button',{name:'关闭窗口'}));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
        expect(screen.getByRole('button',{name:`查看事项：${quote.title}`})).toBeVisible();
        expect(fetch.mock.calls.every(([,o])=>!o.method)).toBe(true);expect(JSON.parse(localStorage.getItem(userKey('inbox.stars')))).toEqual(['quote:12']);
    });
    it('does not represent a failed response as zero work and can retry',async()=>{
        vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce({ok:false,status:500}).mockResolvedValueOnce(ok({...result,items:[],total:0,sources:[]})));
        render(<WorkInbox endpoint="/workspace/inbox"/>);expect(await screen.findByRole('alert')).toHaveTextContent('无法读取');
        expect(screen.queryByText('当前没有待处理事项')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'重新读取'}));expect(await screen.findByText('当前没有待处理事项')).toBeVisible();
    });
    it('shows a private source and read receipt only from its authorized detail endpoint',async()=>{
        const fetch=vi.fn().mockImplementation(url=>Promise.resolve(ok(String(url).includes('/api/inquiries/')?{documents:[{id:8,name:'虚构需求.txt',versions:[{id:14,version:2,size:90}]}],runs:[{id:5,sources:[],state:'review',created_at:'2026-10-10',output:{candidates:{customer_name:{}}}}],events:[{id:4,label:'上传资料',created_at:'2026-10-10',actor_name:'演示用户',detail:{}}]}:result)));
        vi.stubGlobal('fetch',fetch);const user=userEvent.setup();render(<WorkInbox endpoint="/workspace/inbox"/>);await screen.findByText(inquiry.title);await user.click(screen.getByRole('button',{name:`查看事项：${inquiry.title}`}));
        await user.click(screen.getByRole('tab',{name:'资料',exact:true}));expect(await screen.findByRole('link',{name:/虚构需求.txt/})).toHaveAttribute('href','/presales/api/inquiries/3/versions/14/download');
        await user.click(screen.getByRole('tab',{name:'记录',exact:true}));expect(await screen.findByText('上传资料')).toBeVisible();
    });
    it('exposes the source cap instead of pretending the loaded list is complete',async()=>{
        vi.stubGlobal('fetch',vi.fn().mockResolvedValue(ok({...result,total:61})));render(<WorkInbox endpoint="/workspace/inbox"/>);expect(await screen.findByText(/共有 61 项/)).toHaveTextContent('每类展示前 50 项');
    });
});

describe('navigation and keyboard primitives',()=>{
    it('accepts sparse PHP menu arrays at every depth after permission filtering',()=>{
        const model=navigationModel({'3':{text:'销售与客户',submenu:{'2':{text:'订单',submenu:{'4':{text:'列表',href:'/orders'}}}}}});
        expect(model.groups[0].modules[0].pages[0].title).toBe('列表');expect(model.items).toHaveLength(1);
    });
    it('retains authorized nested destinations and resolves the most specific record route',()=>{
        const model=navigationModel([{text:'销售与客户',submenu:[{text:'订单',submenu:[{text:'列表',href:'/orders'},{text:'明细',href:'/orders/lines'}]},{text:'禁止页面',restricted:true,href:'/secret'}]}]);
        expect(model.items.map(x=>new URL(x.href).pathname)).toEqual(['/orders','/orders/lines']);expect(currentModule(model.groups,'/orders/lines/5').module.title).toBe('订单');
    });
    it('supports directional tab selection and isolates stored preferences by user',()=>{
        const change=vi.fn();render(<Segments items={[[1,'任务'],[2,'资料'],[3,'记录']]} value={1} onChange={change} label="测试视图"/>);fireEvent.keyDown(screen.getByRole('tab',{name:'任务'}),{key:'ArrowRight'});expect(change).toHaveBeenCalledWith(2);expect(screen.getByRole('tab',{name:'资料'})).toHaveFocus();
        const meta=document.createElement('meta');meta.name='workspace-user';meta.content='first';document.head.append(meta);const key=userKey('nav.favorites');meta.content='second';expect(userKey('nav.favorites')).not.toBe(key);
    });
});
