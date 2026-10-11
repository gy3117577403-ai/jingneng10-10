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
    it('defaults to extracts, does not submit blank questions and requires explicit demo selection',async()=>{
        const api={get:vi.fn().mockResolvedValue({items:[],page:1,pages:1,capabilities:{demo:true}}),post:vi.fn().mockResolvedValue({id:1,run_id:1})};
        render(<DataAssistant api={api} categories={[]} onOpen={()=>{}}/>);
        expect(screen.getByRole('button',{name:'发送问题'}).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button',{name:'查询设置'}));
        await waitFor(()=>expect(screen.getByRole('option',{name:'模拟测试（未调用模型）'})).toBeTruthy());
        expect(screen.getByLabelText('查询方式').value).toBe('excerpt');expect(screen.getByRole('option',{name:'AI 解读（接口预留）'}).disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('查询方式'),{target:{value:'demo'}});
        expect(screen.getByText(/模拟测试：使用固定规则/)).toBeTruthy();expect(api.post).not.toHaveBeenCalled();
    });
});
