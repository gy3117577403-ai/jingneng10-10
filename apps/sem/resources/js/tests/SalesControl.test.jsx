import React from 'react';
import {render,screen,fireEvent,waitFor,within} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import SalesControl from '../components/SalesControl';
import {confirmAction} from '../ui/confirmAction';
vi.mock('../ui/confirmAction',()=>({confirmAction:vi.fn()}));

const basis={document:{id:1,code:'Q-1',validity_date:'2026-12-20'},relations:{companie:{label:'虚构客户'}},total:226,currency:'CNY',lines:[{id:1,label:'柜体',qty:2,selling_price:100,discount:0,unit:{label:'台'}}],materials:{inquiry:{kind:'cabinet',requirements:'虚构需求'},files:[{id:7,filename:'虚构原件.txt',version:2}]}};
const quote={id:1,can_submit:true,fingerprint:'abc',current:basis,reviews:[],users:[{id:9,name:'核对人员'}],events:[]};
beforeEach(()=>{vi.restoreAllMocks();document.head.innerHTML='<meta name="csrf-token" content="test">';});
function fetcher(data,write){return vi.spyOn(globalThis,'fetch').mockImplementation(async(url,options)=>options?.method==='POST'?write(url,options):{ok:true,json:async()=>data});}
async function filled(){fireEvent.click(await screen.findByRole('button',{name:'提交核对'}));const select=await screen.findByLabelText('核对人');fireEvent.change(select,{target:{value:'9'}});fireEvent.change(screen.getByLabelText('提交说明'),{target:{value:'核对资料与价格'}});fireEvent.click(screen.getByLabelText('已核对本次内容，并向指定人员共享所选资料'));}
it('requires confirmation, keeps failed input, and reuses a receipt after a lost response',async()=>{
    const bodies=[];const mock=fetcher(quote,async(url,options)=>{bodies.push(options);throw new Error('网络中断');});
    render(<SalesControl mode="quote" endpoint="/control"/>);await filled();
    const button=screen.getByRole('button',{name:'提交报价核对'});fireEvent.click(button);
    await screen.findByRole('alert');expect(screen.getByLabelText('提交说明')).toHaveValue('核对资料与价格');
    fireEvent.click(button);await waitFor(()=>expect(bodies).toHaveLength(2));expect(bodies[0].headers['X-Request-ID']).toBe(bodies[1].headers['X-Request-ID']);
    expect(JSON.parse(bodies[0].body).version_ids).toEqual([7]);expect(mock).toHaveBeenCalled();
});
it('blocks a second submission until the first finishes',async()=>{
    let resolve;const calls=[];fetcher(quote,(url,options)=>{calls.push(options);return new Promise(r=>resolve=r);});
    render(<SalesControl mode="quote" endpoint="/control"/>);await filled();
    const form=screen.getByLabelText('提交说明').closest('form');fireEvent.submit(form);fireEvent.submit(form);expect(calls).toHaveLength(1);
    expect(screen.getByRole('button',{name:'正在提交…'})).toBeDisabled();resolve({ok:true,json:async()=>({review_id:3})});
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
it('does not offer approval for stale content and keeps history downloadable',async()=>{
    fetcher({...quote,reviews:[{id:4,version:2,state:'pending',stale:true,can_decide:true,reviewer:'核对人员',snapshot:basis,pdf_url:'/fixed.pdf'}]},()=>{});
    render(<SalesControl mode="quote" endpoint="/control"/>);
    expect(await screen.findByRole('button',{name:'核对并确认'})).toBeDisabled();expect(screen.getByRole('link',{name:'下载提交时草稿'})).toHaveAttribute('href','/fixed.pdf');expect(screen.getByRole('button',{name:'退回修改'})).toBeEnabled();
});
it('requires every handoff checklist item and submits the server revision',async()=>{
    const snapshot={...basis,document:undefined,order:basis.document,checklist:['核对品项','核对资料']};
    const data={id:3,handoff:{state:'working',version:2,revision:5,due_date:'2026-12-20'},can_receive:true,can_send:false,receiver:'技术人员',versions:[{id:8,version:2,snapshot}],events:[],users:[]};
    const calls=[];fetcher(data,async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:false,json:async()=>({message:'交接已被其他人处理'})};});
    render(<SalesControl mode="order" endpoint="/orders/3"/>);fireEvent.click(await screen.findByRole('button',{name:'核对并完成'}));
    const dialog=await screen.findByRole('dialog');const submit=within(dialog).getByRole('button',{name:'完成交接'});
    fireEvent.change(screen.getByLabelText('处理说明'),{target:{value:'逐项确认'}});fireEvent.click(screen.getByLabelText('核对品项'));expect(submit).toBeDisabled();
    fireEvent.click(screen.getByLabelText('核对资料'));fireEvent.click(submit);await screen.findByRole('alert');expect(calls).toEqual([{revision:5,action:'complete',note:'逐项确认',checked:[0,1]}]);
    expect(screen.getByLabelText('处理说明')).toHaveValue('逐项确认');
});
it('shows a retry state without exposing stale actions when access has been removed',async()=>{
    vi.spyOn(globalThis,'fetch').mockResolvedValue({ok:false,status:404,json:async()=>({message:'没有访问权限'})});render(<SalesControl mode="quote" endpoint="/control"/>);
    await screen.findByRole('alert');expect(screen.queryByRole('button',{name:'提交核对'})).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'重新读取'})).toBeInTheDocument();
});
it('closes untouched forms directly but protects a changed file selection',async()=>{
    fetcher(quote,()=>{});confirmAction.mockResolvedValue(false);
    render(<SalesControl mode="quote" endpoint="/control"/>);
    fireEvent.click(await screen.findByRole('button',{name:'提交核对'}));
    fireEvent.click(await screen.findByRole('button',{name:'取消'}));
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(confirmAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'提交核对'}));
    fireEvent.click(await screen.findByLabelText('虚构原件.txt · 第 2 版'));
    fireEvent.click(screen.getByRole('button',{name:'取消'}));
    await waitFor(()=>expect(confirmAction).toHaveBeenCalledOnce());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('虚构原件.txt · 第 2 版')).not.toBeChecked();
});
