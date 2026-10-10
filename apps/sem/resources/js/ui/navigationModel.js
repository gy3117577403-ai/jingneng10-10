export const pathOf = value => { try { return new URL(value, location.origin).pathname.replace(/^\/zh-CN(?=\/|$)/, '').replace(/\/$/, '').toLowerCase(); } catch { return ''; } };
const usable = item => item?.text && item.restricted !== true;
const safeHref = value => { try { const u = new URL(value, location.origin); return value && value !== '#' && ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; } };
export function navigationModel(menu) {
    // Permission filtering preserves PHP array keys; JSON can therefore contain objects.
    const entries = value => Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];
    menu = entries(menu);
    const leaves = (items, prefix = '') => entries(items).filter(usable).flatMap(item => {
        const children = leaves(item.submenu || [], prefix ? `${prefix} / ${item.text}` : item.text);
        const href = safeHref(item.href);
        return children.length ? children : href ? [{ title:item.text, href, trail:prefix, label:item.label, target:item.target || '_self' }] : [];
    });
    const groups = menu.filter(item => usable(item) && entries(item.submenu).length).map(group => ({
        title:group.text,
        modules:entries(group.submenu).filter(usable).map(item => ({ title:item.text, pages:leaves([item]) })).filter(item => item.pages.length),
    })).filter(group => group.modules.length);
    const presales = menu.find(item => item.text === '售前工作台');
    const sales = groups.find(group => group.title === '销售与客户');
    if (sales && presales) sales.modules.unshift({title:'售前询价',pages:leaves([presales])});
    const seen = new Set();
    const items = leaves(menu).filter(item => { if (seen.has(item.href)) return false; seen.add(item.href); return true; });
    return { groups, items };
}
export function currentModule(groups, path = pathOf(location.href)) {
    return groups.flatMap(group => group.modules.map(module => ({group,module,score:Math.max(0,...module.pages.map(page => {
        const target = pathOf(page.href); return target && (path === target || path.startsWith(target + '/')) ? target.length : 0;
    }))}))).filter(match => match.score).sort((a,b) => b.score - a.score)[0] || null;
}
