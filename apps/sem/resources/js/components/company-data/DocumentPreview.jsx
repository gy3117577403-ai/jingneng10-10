import React,{useEffect,useState} from 'react';
import {RotateCw,ChevronLeft,ChevronRight} from 'lucide-react';
import {SurfaceDialog} from '../../ui/WorkspaceKit';
import {ErrorBox,useWrite} from './kit';
import {Highlight} from './DocumentSearch';

function columnName(index){let label='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))label=String.fromCharCode(65+(n-1)%26)+label;return label;}
export default function DocumentPreview({api,detail,file,selection={},onClose}){
    const source=Number(selection.file)===Number(file.id)?selection:{};
    const [page,setPage]=useState(source.page||1),[row,setRow]=useState(source.row||1),[pages,setPages]=useState(1),[content,setContent]=useState(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
    const mutation=useWrite(api);
    useEffect(()=>{const abort=new AbortController();let objectUrl,timer;setContent(null);setError('');
        fetch(`${api.base}/records/${detail.record.id}/versions/${detail.version.id}/files/${file.id}?page=${page}&row=${row}`,{credentials:'same-origin',headers:{Accept:'application/json'},signal:abort.signal}).then(async r=>{
            if(!r.ok){const j=await r.json().catch(()=>null);throw new Error(r.status<500&&/[\u3400-\u9fff]/.test(j?.message||'')?j.message:'预览不可用，请刷新权限或稍后重试。');}
            if(r.headers.get('Content-Type')?.includes('application/json'))return r.json();
            const blob=await r.blob();if(abort.signal.aborted)return null;objectUrl=URL.createObjectURL(blob);setPages(Number(r.headers.get('X-Preview-Pages'))||1);return {type:'image',url:objectUrl};
        }).then(c=>{if(!abort.signal.aborted){setContent(c);if(c?.type==='processing'&&['queued','processing'].includes(c.state))timer=setTimeout(()=>setRefresh(x=>x+1),2500);}}).catch(e=>{if(!abort.signal.aborted)setError(/[\u3400-\u9fff]/.test(e.message)?e.message:'无法读取预览，请检查网络后重试。');});
        const focus=()=>setRefresh(x=>x+1);window.addEventListener('focus',focus);
        return()=>{abort.abort();clearTimeout(timer);if(objectUrl)URL.revokeObjectURL(objectUrl);window.removeEventListener('focus',focus);};
    },[api,detail.record.id,detail.version.id,file.id,page,row,refresh]);
    const step=content?.type==='sheet'?50:200;
    return <SurfaceDialog title={file.filename} onClose={onClose} className="dc-dialog dc-preview dc-document-preview"><div className="dc-dialog-body"><div className="dc-preview-tools"><span>版本 {detail.version.number}{Number(detail.version.id)!==Number(detail.record.published_version_id)?' · 非当前发布版':''}</span><button className="dc-icon" aria-label="刷新文件预览" onClick={()=>setRefresh(x=>x+1)}><RotateCw size={16}/></button></div>
        {source.source&&<p className="dc-notice">来源定位：{source.source}。请结合上下文核对。</p>}<ErrorBox error={error||mutation.error}/>
        {['partial','no_text'].includes(file.reading?.state)&&<p className="dc-notice">{file.reading.message}</p>}
        {content?.type==='image'&&<><div className="dc-reader-pagination"><button className="btn btn-default" disabled={page===1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={15}/>上一页</button><label>第 <input aria-label="预览页码" type="number" min="1" max={Math.min(pages,200)} value={page} onChange={e=>{const n=Number(e.target.value);if(n>=1&&n<=Math.min(pages,200))setPage(n);}}/> / {pages} 页</label><button className="btn btn-default" disabled={page>=Math.min(pages,200)} onClick={()=>setPage(p=>p+1)}>下一页<ChevronRight size={15}/></button></div><img src={content.url} alt={`${file.filename} 第${page}页`}/>{pages>200&&<p className="dc-help">当前最多预览前200页。</p>}</>}
        {content?.type==='sheet'&&<><div className="dc-sheet-tabs" role="group" aria-label="工作表">{content.sheets.map((name,i)=><button key={i} className={page===i+1?'is-selected':''} aria-pressed={page===i+1} onClick={()=>{setPage(i+1);setRow(1);}}>{name}</button>)}</div><div className="dc-sheet-scroll"><table><thead><tr><th>行</th>{Array.from({length:content.columns},(_,i)=><th key={i}>{columnName(i)}</th>)}</tr></thead><tbody>{content.rows.map((cells,i)=><tr key={i} className={Number(source.page)===page&&Number(source.row)===content.start+i?'is-located':''}><th>{content.start+i}</th>{cells.map((value,j)=><td key={j}><Highlight text={value} query={source.query}/></td>)}</tr>)}</tbody></table></div><p className="dc-help">{content.message} 阅读视图按单元格展示，不保留原文件的图表、合并单元格和打印排版。</p></>}
        {content?.type==='text'&&<><pre className="dc-text-source"><Highlight text={content.text} query={source.query}/></pre>{content.truncated&&<p className="dc-help">仅阅读与检索前部分内容，请拆分较大的文本。</p>}</>}
        {['sheet','text'].includes(content?.type)&&<div className="dc-reader-pagination"><button className="btn btn-default" disabled={content.start<=1} onClick={()=>setRow(Math.max(1,content.start-step))}>上一段</button><span>第 {content.start}—{Math.min(content.start+step-1,content.total)} 行 / 共 {content.total} 行</span><button className="btn btn-default" disabled={content.start+step>content.total} onClick={()=>setRow(content.start+step)}>下一段</button></div>}
        {!content&&!error&&<p className="dc-empty" role="status">正在读取预览…</p>}
        {content?.type==='processing'&&<div className="dc-empty" role="status"><strong>{content.label}</strong><p>{content.message}</p>{content.state==='failed'&&detail.abilities.edit&&<button className="btn btn-primary" disabled={mutation.busy} onClick={async()=>{const result=await mutation.write(`/records/${detail.record.id}/versions/${detail.version.id}/files/${file.id}/retry`,{});if(result)setRefresh(x=>x+1);}}>重新处理</button>}</div>}
        {content?.type==='unsupported'&&<p className="dc-empty">{content.message}</p>}
    </div></SurfaceDialog>;
}
