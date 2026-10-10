import { describe, it, expect, vi, afterEach } from 'vitest';
import { bindUnsavedForms } from '../ui/unsavedForm';
afterEach(() => { document.querySelector('.jn-confirm')?.dispatchEvent(new Event('cancel')); document.body.replaceChildren(); vi.restoreAllMocks(); });
describe('document draft navigation', () => {
    it('keeps edits and the current page when navigation is cancelled', async () => {
        HTMLDialogElement.prototype.showModal = vi.fn(function () { this.open = true; });
        const root = document.createElement('div'); root.innerHTML = '<form data-jn-edit-form><input name="label" value="Original"></form><a href="/quotes">列表</a>'; document.body.append(root);
        bindUnsavedForms(root);
        const input = root.querySelector('input'); input.value = 'Unsaved'; input.dispatchEvent(new Event('input',{bubbles:true}));
        const event = new MouseEvent('click',{bubbles:true,cancelable:true}); root.querySelector('a').dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true); expect(document.querySelector('.jn-confirm')).not.toBeNull();
        [...document.querySelectorAll('.jn-confirm button')].find(b=>b.textContent==='继续编辑').click(); await Promise.resolve();
        expect(input.value).toBe('Unsaved'); expect(document.querySelector('.jn-confirm')).toBeNull();
    });
    it('opens collapsed fields when native validation finds an error', () => {
        const root = document.createElement('div'); root.innerHTML = '<details><input required></details>'; document.body.append(root); bindUnsavedForms(root);
        root.querySelector('input').dispatchEvent(new Event('invalid',{cancelable:true}));
        expect(root.querySelector('details').open).toBe(true);
    });
});
