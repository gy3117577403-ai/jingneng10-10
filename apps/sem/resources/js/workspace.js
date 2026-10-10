import '../css/workspace.css';
import { bindFormConfirmations, confirmAction } from './ui/confirmAction';
import { bindUnsavedForms } from './ui/unsavedForm';

const safeRead = key => { try { return localStorage.getItem(key); } catch { return null; } };
const safeWrite = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Preferences are optional. */ } };

function boot() {
    window.jnConfirm = confirmAction;
    bindFormConfirmations();
    bindUnsavedForms();
    const labels = { pushmenu:'切换导航', 'navbar-search':'搜索业务记录', fullscreen:'切换全屏' };
    document.querySelectorAll('.main-header [data-widget]').forEach(el => { if (labels[el.dataset.widget]) { el.title = labels[el.dataset.widget]; el.setAttribute('aria-label', el.title); } });
    document.querySelectorAll('.main-header .nav-link').forEach(el => { if (el.querySelector('.fa-moon, .fa-sun')) el.setAttribute('aria-label', '切换显示主题'); if (el.querySelector('.fa-bell')) { el.title = '通知'; el.setAttribute('aria-label', '通知'); } });
    const body = document.body;
    const density = document.querySelector('[data-jn-density]');
    const setDensity = value => {
        body.dataset.density = value;
        if (density) density.textContent = `显示密度：${value === 'comfortable' ? '舒适' : '紧凑'}`;
    };
    setDensity(safeRead('jn.density') || 'compact');
    density?.addEventListener('click', () => {
        const value = body.dataset.density === 'compact' ? 'comfortable' : 'compact'; setDensity(value); safeWrite('jn.density', value);
    });
    document.querySelectorAll('.login-box input[name=email]').forEach(el => { el.autocomplete = 'username'; el.setAttribute('aria-label', '邮箱'); });
    document.querySelectorAll('.login-box input[name=password]').forEach(el => { el.autocomplete = 'current-password'; el.setAttribute('aria-label', '密码'); });
    const dialog = document.getElementById('jn-command');
    if (!dialog) return;
    const input = dialog.querySelector('input'), results = dialog.querySelector('nav'), empty = dialog.querySelector('.jn-command-empty');
    const normalize = value => value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
    const normalizePath = value => new URL(value, location.origin).pathname.replace(/^\/zh-CN(?=\/|$)/, '').replace(/\/$/, '');
    const seen = new Set(); const items = [];
    document.querySelectorAll('.main-sidebar .nav-link[href]').forEach(link => {
        const href = link.getAttribute('href');
        if (!href || href === '#' || !/^https?:|^\//.test(href)) return;
        if (link.nextElementSibling?.classList.contains('nav-treeview')) return;
        const title = link.querySelector('p')?.childNodes[0]?.textContent?.trim() || link.textContent.trim();
        if (!title || seen.has(href)) return; seen.add(href);
        const parents = []; let node = link.closest('ul.nav-treeview');
        while (node) { const p = node.parentElement.querySelector(':scope > a p'); if (p) parents.unshift(p.childNodes[0]?.textContent?.trim()); node = node.parentElement.parentElement.closest('ul.nav-treeview'); }
        items.push({ href, title, section: parents.join(' / '), search: normalize(parents.join(' ') + ' ' + title) });
    });
    let matches = [], selected = 0, lastFocus;
    function highlight() { [...results.children].forEach((a, i) => { a.classList.toggle('is-selected', i === selected); }); results.children[selected]?.scrollIntoView({ block: 'nearest' }); }
    function render() {
        const terms = normalize(input.value).split(' ').filter(Boolean);
        matches = items.filter(item => terms.every(term => item.search.includes(term))).slice(0, 60); selected = 0;
        results.replaceChildren();
        for (const item of matches) {
            const a = document.createElement('a'); a.href = item.href;
            const name = document.createElement('strong'); name.textContent = item.title;
            const category = document.createElement('span'); category.textContent = item.section;
            a.append(name, category); results.append(a);
        }
        empty.hidden = matches.length > 0; highlight();
    }
    function open() { lastFocus = document.activeElement; input.value = ''; render(); if (!dialog.open) dialog.showModal(); input.focus(); }
    document.querySelectorAll('[data-jn-command-open]').forEach(b => b.addEventListener('click', open));
    dialog.querySelector('[data-jn-command-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => { const r = dialog.getBoundingClientRect(); if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dialog.close(); });
    dialog.addEventListener('close', () => lastFocus?.focus());
    input.addEventListener('input', render);
    input.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(0, Math.min(matches.length - 1, selected + (e.key === 'ArrowDown' ? 1 : -1))); highlight(); }
        if (e.key === 'Enter' && matches[selected]) { e.preventDefault(); results.children[selected]?.click(); }
    });
    document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); } });
    // Expand the current module even when AdminLTE's original URL lacks the locale prefix.
    const current = normalizePath(location.href);
    const links = [...document.querySelectorAll('.main-sidebar .nav-link[href]')].filter(a => a.getAttribute('href') && a.getAttribute('href') !== '#');
    const active = links.filter(a => { const target = normalizePath(a.href); return target && (current === target || current.startsWith(target + '/')); }).sort((a, b) => b.href.length - a.href.length)[0];
    if (active) {
        active.classList.add('active'); let ul = active.closest('ul.nav-treeview');
        while (ul) { ul.parentElement.classList.add('menu-open'); ul.style.display = 'block'; ul = ul.parentElement.parentElement.closest('ul.nav-treeview'); }
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
