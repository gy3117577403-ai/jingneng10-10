import React from 'react';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import DataAssistant,{SourceAnswer} from '../components/company-data/DataAssistant';
import {makeApi} from '../components/company-data/kit';

afterEach(()=>{cleanup();vi.restoreAllMocks();history.replaceState(null,'','/');});
const source={id:'S1',record_id:2,version_id:3,file_id:4,version:2,page:7,row:1,title:'虚构制度',location:'第7页',historical:false};
const run={id:1,question:'如何核对？',mode:'excerpt',state:'ready',sources:[source],answer:{paragraphs:[{text:'<script>window.leak=true</script>',citations:[{source_id:'S1',quote:'原文'}]}]},retrieval:{terms:['核对']}};
describe('source assistant boundaries',()=>{
    it('turns a login redirect into a readable error instead of a null application response',async()=>{
        vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,redirected:true,json:()=>Promise.reject(new Error('HTML'))}));
        await expect(makeApi('/company-data/api').get('/assistant')).rejects.toThrow('登录已过期');vi.unstubAllGlobals();
    });
    it('renders untrusted text literally and opens the exact versioned source',()=>{
        const open=vi.fn();render(<SourceAnswer run={run} onOpen={open} onAction={()=>{}}/>);
        expect(document.querySelector('script')).toBeNull();expect(screen.getByText('<script>window.leak=true</script>')).toBeTruthy();
        fireEvent.click(screen.getByRole('button',{name:/虚构制度/}));expect(open).toHaveBeenCalledWith(run,source);
    });
    it('never displays a cached paragraph when the response is restricted',()=>{
        render(<SourceAnswer run={{...run,state:'restricted'}} onOpen={()=>{}} onAction={()=>{}}/>);
        expect(screen.queryByText('<script>window.leak=true</script>')).toBeNull();expect(screen.getByText('来源权限或内容状态已变化')).toBeTruthy();
    });
    it('clearly labels demo answers and keeps cancellation functional',()=>{
        const action=vi.fn();render(<SourceAnswer run={{...run,mode:'demo',state:'processing'}} onOpen={()=>{}} onAction={action}/>);
        expect(screen.getByText('模拟测试 · 未调用模型')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'取消'}));expect(action).toHaveBeenCalledWith(expect.anything(),'cancel');
    });
    it('keeps archived conversations readable while disabling feedback actions',async()=>{
        history.replaceState(null,'','/?conversation=1');
        const api={get:vi.fn(path=>Promise.resolve(path.includes('/conversations/')?{conversation:{id:1,title:'归档会话',archived:true},runs:[run],capabilities:{demo:true}}:{items:[],page:1,pages:1,capabilities:{demo:true}})),post:vi.fn()};
        render(<DataAssistant api={api} categories={[]} onOpen={()=>{}}/>);
        await waitFor(()=>expect(screen.getByRole('button',{name:'反馈问题'}).disabled).toBe(true));
        expect(screen.getByRole('button',{name:'有帮助'}).disabled).toBe(true);
        expect(screen.getByRole('button',{name:/虚构制度/}).disabled).toBe(false);
        expect(screen.getByRole('button',{name:'恢复会话'}).disabled).toBe(false);
        expect(screen.queryByRole('button',{name:'发送问题'})).toBeNull();
    });
    it('defaults to extracts, does not submit blank questions and requires explicit demo selection',async()=>{
        const api={get:vi.fn().mockResolvedValue({items:[],page:1,pages:1,capabilities:{demo:true}}),post:vi.fn().mockResolvedValue({id:1,run_id:1})};
        render(<DataAssistant api={api} categories={[]} onOpen={()=>{}}/>);
        expect(screen.getByRole('button',{name:'发送问题'}).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button',{name:'查询设置'}));
        await waitFor(()=>expect(screen.getByRole('option',{name:'模拟测试（未调用模型）'})).toBeTruthy());
        expect(screen.getByLabelText('查询方式').value).toBe('excerpt');expect(screen.getByRole('option',{name:'AI 解读（ChatGPT 套餐）'}).disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('查询方式'),{target:{value:'demo'}});
        expect(screen.getByText(/模拟测试：使用固定规则/)).toBeTruthy();expect(api.post).not.toHaveBeenCalled();
    });
    it('labels actual AI responses and reports tokens without inventing a credit conversion',()=>{
        render(<SourceAnswer run={{...run,mode:'openai',provider:{model:'fixture-model',attempts:[{usage:{input_tokens:10,output_tokens:5,total_tokens:15}}]}}} onOpen={()=>{}} onAction={()=>{}}/>);
        expect(screen.getByText('AI 解读 · ChatGPT 套餐')).toBeTruthy();expect(screen.queryByText('原文摘录 · 未使用 AI')).toBeNull();
        expect(screen.getByText(/共 15 个词元/)).toBeTruthy();expect(screen.getByText(/词元数量不等于积分扣除数/)).toBeTruthy();
    });
    it('enables only an available connection and explains the external request before sending',async()=>{
        const api={get:vi.fn().mockResolvedValue({items:[],page:1,pages:1,capabilities:{openai:true,connection:{available:true,status:'ready',message:'连接已就绪',model:'fixture-model',account:'虚构账号',connection_url:'http://127.0.0.1:1234/'}}}),post:vi.fn()};
        render(<DataAssistant api={api} categories={[]} onOpen={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'查询设置'}));
        await waitFor(()=>expect(screen.getByRole('option',{name:'AI 解读（ChatGPT 套餐）'}).disabled).toBe(false));
        fireEvent.change(screen.getByLabelText('查询方式'),{target:{value:'openai'}});
        expect(screen.getByText(/将问题与有权查看的来源片段发送给 OpenAI/)).toBeTruthy();expect(api.post).not.toHaveBeenCalled();
        expect(screen.getByRole('button',{name:'暂停 AI 解读'})).toBeTruthy();
    });
    it('shows insufficient evidence as abstention without fabricated paragraphs',()=>{
        render(<SourceAnswer run={{...run,state:'insufficient_evidence',mode:'openai',answer:{paragraphs:[],abstained:true}}} onOpen={()=>{}} onAction={()=>{}}/>);
        expect(screen.getByText('现有资料不足以回答这个问题')).toBeTruthy();expect(document.querySelector('blockquote')).toBeNull();
    });
});
