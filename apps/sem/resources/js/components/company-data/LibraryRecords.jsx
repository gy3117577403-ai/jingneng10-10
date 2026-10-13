import React, {useState} from 'react';
import {Menu} from '@base-ui/react/menu';
import {Check, Columns3, Download, FileText, LockKeyhole, Plus, Upload, X} from 'lucide-react';
import {Button} from '../../ui/shadcn/controls';
import {readPreference, savePreference} from '../../ui/WorkspaceKit';
import {Badge, show, when} from './kit';

export function LibraryActions({category, api, onCreate, onImport}) {
    if (!category) return <span className="dc-help dc-context-hint">选择分类后可新建或导入</span>;
    return <div className="dc-inline dc-library-actions">
        {category.abilities.export && <a className="btn btn-default" href={`${api.base}/export/${category.id}`} title="导出本分类有导出权限的全部已发布资料，不受列表筛选影响"><Download size={15}/>导出已发布台账</a>}
        {category.abilities.create && category.abilities.view && <>
            <Button onClick={onImport}><Upload size={15}/>导入表格</Button>
            <Button variant="primary" onClick={onCreate}><Plus size={16}/>新建资料</Button>
        </>}
    </div>;
}

export function LibraryFilters({query, onChange, category, total}) {
    const active = query.q || query.state || query.kind || query.scope !== 'all' || query.archived;
    return <div className="dc-ledger-controls">
        <div className="dc-list-meta"><div className="dc-inline"><strong>{category?.name || '全部可见资料'}</strong><span className="dc-muted">{total}项</span></div>
            <select aria-label="资料排序" value={query.sort} onChange={e => onChange({sort: e.target.value})}>
                <option value="updated">最近更新</option><option value="oldest">最早更新</option><option value="title">按名称排序</option><option value="code">按编号排序</option>
            </select>
        </div>
        <div className="dc-ledger-filters" role="group" aria-label="台账筛选">
            <select aria-label="工作范围" value={query.scope} onChange={e => onChange({scope: e.target.value})}><option value="all">全部可见</option><option value="created">我创建的</option><option value="review">待我审核</option></select>
            <select aria-label="资料类型筛选" value={query.kind} onChange={e => onChange({kind: e.target.value})}><option value="">全部类型</option><option value="ledger">结构化台账</option><option value="file">文件资料</option></select>
            <select aria-label="资料状态" value={query.state} onChange={e => onChange({state: e.target.value})}><option value="">全部状态</option><option value="published">已发布</option><option value="draft">草稿</option><option value="pending">待审核</option><option value="rejected">已退回</option><option value="withdrawn">已撤回</option></select>
            <label className="dc-check"><input type="checkbox" checked={query.archived} onChange={e => onChange({archived: e.target.checked})}/>归档资料</label>
            {active && <Button variant="ghost" onClick={() => onChange({q: '', state: '', kind: '', scope: 'all', archived: false})}><X size={14}/>清除筛选</Button>}
        </div>
    </div>;
}

export function LibraryTable({items, categories, category, userId, onOpen}) {
    const fields = category?.fields || [];
    const preferenceKey = `data.columns.${userId}.${category?.id || 'all'}`;
    const [columnKeys, setColumnKeys] = useState(() => {
        const saved = readPreference(preferenceKey, null);
        return Array.isArray(saved) ? saved : fields.slice(0, 4).map(field => field.key);
    });
    const columns = fields.filter(field => columnKeys.includes(field.key));
    function changeColumns(next) {setColumnKeys(next); savePreference(preferenceKey, next);}
    return <>
        {fields.length > 0 && <div className="dc-ledger-columnbar"><span>按当前可查看版本展示 · {columns.length}/{fields.length}个业务字段</span>
            <Menu.Root><Menu.Trigger render={<Button variant="ghost"/>}><Columns3 size={15}/>显示列</Menu.Trigger>
                <Menu.Portal><Menu.Positioner align="end" sideOffset={5} className="jn-control-positioner"><Menu.Popup className="jn-control-popup dc-column-menu" aria-label="显示业务字段">
                    {fields.map(field => <Menu.CheckboxItem key={field.key} className="jn-control-option" checked={columnKeys.includes(field.key)} closeOnClick={false} onCheckedChange={checked => changeColumns(checked ? [...columnKeys, field.key] : columnKeys.filter(key => key !== field.key))}>
                        <span>{field.label}</span><Menu.CheckboxItemIndicator><Check size={14}/></Menu.CheckboxItemIndicator>
                    </Menu.CheckboxItem>)}
                    <Menu.Item className="jn-control-option" onClick={() => changeColumns(fields.map(field => field.key))}>显示全部字段</Menu.Item>
                </Menu.Popup></Menu.Positioner></Menu.Portal>
            </Menu.Root>
        </div>}
        <div className="dc-table-wrap dc-ledger-table" tabIndex={0} role="region" aria-label="台账列表，可横向滚动"><table><thead><tr>
            <th scope="col">资料名称</th>{!category && <th scope="col">分类</th>}
            {columns.map(field => <th scope="col" key={field.key}>{field.label}</th>)}<th scope="col">版本与状态</th><th scope="col">更新于</th>
        </tr></thead><tbody>{items.map(record => <tr key={record.id}>
            <td><button className="dc-record-link" onClick={() => onOpen({id: record.id})}>{record.readable ? <FileText size={18}/> : <LockKeyhole size={18}/>}<span><strong>{record.title}</strong><small>{record.code} · {record.kind === 'ledger' ? '台账' : '文件资料'}</small></span></button></td>
            {!category && <td className="dc-category-cell">{categories.find(item => item.id === record.category_id)?.name}</td>}
            {columns.map(field => <td key={field.key} className={`dc-value-cell ${field.type === 'number' ? 'is-numeric' : ''}`}><span title={record.readable ? show(record.values?.[field.key]) : undefined}>{record.readable ? show(record.values?.[field.key]) : <span className="dc-muted">需授权查看</span>}</span></td>)}
            <td><span className="dc-version">第{record.version}版</span><Badge state={record.state}/></td><td className="dc-date-cell">{when(record.updated_at)}</td>
        </tr>)}</tbody></table></div>
    </>;
}
