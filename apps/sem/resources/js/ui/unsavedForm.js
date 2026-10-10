import { confirmAction } from './confirmAction';

// Limited to explicitly marked, server-submitted document forms. React editors
// retain their own draft handling. Hash tabs keep the same DOM and draft.
export function bindUnsavedForms(root = document) {
    const dirty = new Set();
    root.querySelectorAll('form[data-jn-edit-form]').forEach(form => {
        form.addEventListener('input', () => dirty.add(form));
        form.addEventListener('change', () => dirty.add(form));
        form.addEventListener('submit', () => dirty.delete(form));
    });
    root.addEventListener('click', async event => {
        if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !dirty.size) return;
        const link = event.target.closest?.('a[href]');
        if (!link || link.target || link.hasAttribute('download') || link.getAttribute('href').startsWith('#') || link.dataset.toggle) return;
        const url = new URL(link.href, location.href);
        if (!['http:', 'https:'].includes(url.protocol)) return;
        event.preventDefault(); event.stopPropagation();
        const hasDraft = [...dirty].every(form => form.dataset.jnDraftSaved === 'true');
        const message = hasDraft ? '当前修改尚未提交。已保留本标签页临时草稿，返回时可恢复；服务端记录保持原值。' : '当前表单有未保存的修改。离开后，本次修改不会保存。';
        if (await confirmAction(message, {title:'离开当前页面？',cancelLabel:'继续编辑',confirmLabel:hasDraft ? '保留草稿并离开' : '放弃并离开'})) {
            dirty.clear(); location.assign(url.href);
        }
    }, true);
    root.addEventListener('invalid', event => { let parent = event.target.parentElement; while (parent) { if (parent.tagName === 'DETAILS') parent.open = true; parent = parent.parentElement; } }, true);
}
