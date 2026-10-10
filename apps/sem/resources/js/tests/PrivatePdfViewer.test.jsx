import React from 'react';
import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect,vi,afterEach} from 'vitest';
const pdf=vi.hoisted(()=>({getDocument:vi.fn()}));
vi.mock('pdfjs-dist',()=>({getDocument:pdf.getDocument,GlobalWorkerOptions:{}}));
import PrivatePdfViewer from '../components/PrivatePdfViewer';
afterEach(()=>vi.unstubAllGlobals());

it('renders selected pages, bounds page navigation and disposes the private document on close',async()=>{
    vi.stubGlobal('ResizeObserver',class{constructor(callback){this.callback=callback;}observe(){this.callback([{contentRect:{width:700}}]);}disconnect(){}});
    const destroy=vi.fn(),getPage=vi.fn(async n=>({getViewport:({scale})=>({width:420*scale,height:240*scale}),render:()=>({promise:Promise.resolve(),cancel:vi.fn()}),getTextContent:async()=>({items:[{str:`虚构文档第${n}页`}]})}));
    pdf.getDocument.mockReturnValue({promise:Promise.resolve({numPages:2,getPage}),destroy});
    const user=userEvent.setup();const app=render(<PrivatePdfViewer data={new ArrayBuffer(8)} name="虚构资料.pdf"/>);
    await waitFor(()=>expect(screen.getByRole('button',{name:'下一页资料'})).toBeEnabled());expect(screen.getByRole('button',{name:'上一页资料'})).toBeDisabled();
    await user.click(screen.getByRole('button',{name:'下一页资料'}));await waitFor(()=>expect(screen.getByRole('button',{name:'上一页资料'})).toBeEnabled());
    expect(screen.getByText('第 2 / 2 页')).toBeVisible();expect(screen.getByRole('button',{name:'下一页资料'})).toBeDisabled();expect(getPage).toHaveBeenCalledWith(2);
    app.unmount();expect(destroy).toHaveBeenCalledOnce();
});
