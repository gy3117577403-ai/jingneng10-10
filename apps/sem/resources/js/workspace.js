import '../css/workspace.css';
import '../css/focused-workspace.css';
import '../css/sales-continuity.css';
import '../css/sales-control.css';
import { bindFormConfirmations, confirmAction } from './ui/confirmAction';
import { bindUnsavedForms } from './ui/unsavedForm';
import { bindDocumentContinuity } from './ui/documentContinuity';
import { bindSalesNavigation } from './ui/salesNavigation';

const safeRead = key => { try { return localStorage.getItem(key); } catch { return null; } };
const safeWrite = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Preferences are optional. */ } };

function boot() {
    window.jnConfirm = confirmAction;
    bindFormConfirmations();
    bindUnsavedForms();
    bindDocumentContinuity();
    bindSalesNavigation();
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
    if (document.getElementById('jn-workspace-shell')) {
        import('./components/WorkspaceShell.jsx').then(({ mountWorkspaceShell }) => mountWorkspaceShell());
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
