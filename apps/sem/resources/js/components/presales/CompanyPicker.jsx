import React, { useEffect, useState } from 'react';

export default function CompanyPicker({ api, value, onChange }) {
    const [query, setQuery] = useState(''), [items, setItems] = useState([]), [selected, setSelected] = useState(null), [error, setError] = useState('');
    useEffect(() => {
        let current = true;
        if (!value) { setSelected(null); return; }
        api(`/companies?id=${value}`).then(rows => { if(current) setSelected(rows[0] || {label:'客户已停用或不可用'}); }).catch(() => { if(current) setError('客户信息读取失败，请重试。'); });
        return () => {current = false;};
    }, [value]);
    useEffect(() => {
        let current = true;
        const timer = setTimeout(() => api(`/companies?q=${encodeURIComponent(query)}`).then(rows => {if(current) {setItems(rows);setError('');}}).catch(()=>{if(current)setError('客户查询失败，请重新输入查询。');}), 200);
        return () => {current=false;clearTimeout(timer);};
    }, [query]);
    return <div className="jn-company-picker">
        <label>关联客户档案<input type="search" placeholder="按名称或编号查找客户" value={query} onChange={e=>setQuery(e.target.value)}/></label>
        <label className="ps-sr" htmlFor="jn-inquiry-company">选择客户档案</label>
        <select id="jn-inquiry-company" value={value || ''} onChange={e=>onChange(e.target.value ? Number(e.target.value) : null)}>
            <option value="">暂不关联</option>
            {value && !items.some(item=>item.id===Number(value)) && <option value={value}>{selected?.label || '正在读取客户…'}</option>}
            {items.map(item=><option key={item.id} value={item.id}>{item.label} · {item.code}</option>)}
        </select>
        <small className="ps-muted">选择已有档案，生成报价时使用。名称相似不会自动合并。</small>
        {error && <span role="alert" className="ps-field-error">{error}</span>}
    </div>;
}
