import React, {useEffect, useRef, useState} from 'react';
import {getDocument, GlobalWorkerOptions} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw} from 'lucide-react';

GlobalWorkerOptions.workerSrc=workerUrl;

export default function PrivatePdfViewer({data,name}) {
    const [pdf,setPdf]=useState(null),[page,setPage]=useState(1),[zoom,setZoom]=useState(1),[width,setWidth]=useState(700),[busy,setBusy]=useState(true),[error,setError]=useState(''),[text,setText]=useState('');
    const host=useRef(null);
    useEffect(()=>{
        let cancelled=false;
        const base=`${import.meta.env.BASE_URL}pdfjs/`;
        const task=getDocument({data:new Uint8Array(data.slice(0)),cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/',iccUrl:base+'iccs/',useSystemFonts:true});
        task.promise.then(doc=>{if(!cancelled){setPdf(doc);setPage(1);}}).catch(e=>{if(!cancelled){setError(e.name==='PasswordException'?'此文件需要密码，请下载后打开。':'文档暂时无法解析，请下载原件查看。');setBusy(false);}});
        return()=>{cancelled=true;task.destroy();};
    },[data]);
    useEffect(()=>{const observer=new ResizeObserver(entries=>setWidth(Math.round(entries[0].contentRect.width)));if(host.current)observer.observe(host.current);return()=>observer.disconnect();},[]);
    useEffect(()=>{
        if(!pdf||!host.current||width<1)return;
        let cancelled=false,renderTask;setBusy(true);setError('');setText('');
        (async()=>{
            const sheet=await pdf.getPage(page);if(cancelled)return;
            const initial=sheet.getViewport({scale:1});const viewport=sheet.getViewport({scale:Math.max(.1,(width-32)/initial.width)*zoom});
            const ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(16000000/(viewport.width*viewport.height)));
            const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',`${name}，第 ${page} 页`);canvas.setAttribute('role','img');
            canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);canvas.style.width=`${viewport.width}px`;canvas.style.height=`${viewport.height}px`;
            host.current.replaceChildren(canvas);
            renderTask=sheet.render({canvas,viewport,transform:[ratio,0,0,ratio,0,0]});await renderTask.promise;
            const content=await sheet.getTextContent();if(!cancelled){setText(content.items.map(item=>item.str||'').join(' '));setBusy(false);}
        })().catch(e=>{if(!cancelled&&e.name!=='RenderingCancelledException'){setError('此页无法显示，请下载原件查看。');setBusy(false);}});
        return()=>{cancelled=true;renderTask?.cancel();};
    },[pdf,page,zoom,width,name]);
    return <div className="jn-pdf-viewer">
        <div className="jn-pdf-toolbar"><div><button className="jn-icon-button" aria-label="上一页资料" disabled={!pdf||page===1||busy} onClick={()=>setPage(v=>v-1)}><ChevronLeft size={16}/></button><span>{pdf?`第 ${page} / ${pdf.numPages} 页`:error?'无法显示文档':'正在读取文档…'}</span><button className="jn-icon-button" aria-label="下一页资料" disabled={!pdf||page===pdf.numPages||busy} onClick={()=>setPage(v=>v+1)}><ChevronRight size={16}/></button></div><div><button className="jn-icon-button" aria-label="缩小资料" disabled={!pdf||zoom<=.5||busy} onClick={()=>setZoom(v=>v-.25)}><ZoomOut size={16}/></button><button className="jn-text-button" disabled={!pdf||busy} onClick={()=>setZoom(1)}><RotateCcw size={13}/>{zoom===1?'适合宽度':`${Math.round(zoom*100)}%`}</button><button className="jn-icon-button" aria-label="放大资料" disabled={!pdf||zoom>=3||busy} onClick={()=>setZoom(v=>v+.25)}><ZoomIn size={16}/></button></div></div>
        {error&&<p className="jn-inline-error" role="alert">{error}</p>}{busy&&<p className="jn-pdf-status" role="status">正在显示页面…</p>}
        <div className="jn-pdf-canvas" ref={host} aria-busy={busy}/>
        {text&&<details className="jn-pdf-text"><summary>本页文字</summary><p>{text}</p></details>}
    </div>;
}
