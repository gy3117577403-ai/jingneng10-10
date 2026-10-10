import React, { useEffect, useState } from 'react';
import { SurfaceDialog } from '../ui/WorkspaceKit';
import { FileText, Download } from 'lucide-react';

export default function PrivateFilePreview({file,url,onClose}) {
    const [content,setContent]=useState(null),[error,setError]=useState('');
    const text=['txt','csv'].includes(file.extension), image=['png','jpg','jpeg'].includes(file.extension), pdf=file.extension==='pdf';
    useEffect(()=>{
        if(!text&&!image&&!pdf)return;
        const abort=new AbortController();let objectUrl;
        fetch(url,{credentials:'same-origin',headers:{Accept:'application/json'},signal:abort.signal}).then(async r=>{
            if(!r.ok || r.redirected)throw new Error([401,419].includes(r.status)||r.redirected?'登录状态已过期，请重新登录。':r.status===404?'资料不存在或访问权限已变化。':'暂时无法预览，请重试下载原件。');
            if(text)return {text:await r.text()};
            if(pdf){const data=await r.arrayBuffer();const {default:Pdf}=await import('./PrivatePdfViewer');return {data,Pdf};}
            const blob=await r.blob();if(abort.signal.aborted)return null;
            objectUrl=URL.createObjectURL(new Blob([blob],{type:pdf?'application/pdf':file.extension==='png'?'image/png':'image/jpeg'}));return {url:objectUrl};
        }).then(data=>{if(!abort.signal.aborted)setContent(data);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});
        return()=>{abort.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
    },[url]);
    return <SurfaceDialog title={file.filename} onClose={onClose} className="jn-file-preview"><div className="jn-preview-meta">第 {file.version} 版 · {(file.size/1024).toFixed(1)} KB <a href={url}><Download size={14}/> 下载原件</a></div><div className="jn-preview-content">
        {error?<p className="jn-inline-error" role="alert">{error}</p>:!text&&!image&&!pdf?<div className="jn-empty"><FileText size={32}/><strong>此格式请下载后查看</strong><p>文件原件与版本记录仍完整保留。</p></div>:!content?<div className="jn-empty" role="status">正在读取资料…</div>:text?<pre>{content.text}</pre>:image?<img src={content.url} alt={`${file.filename} 原件预览`}/>:<content.Pdf data={content.data} name={file.filename}/>}
    </div></SurfaceDialog>;
}
