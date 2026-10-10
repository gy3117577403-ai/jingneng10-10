import { describe, it, expect, vi, afterEach } from 'vitest';
import { confirmAction, bindFormConfirmations } from '../ui/confirmAction';

afterEach(() => { document.querySelector('dialog.jn-confirm')?.dispatchEvent(new Event('cancel')); document.body.replaceChildren(); vi.restoreAllMocks(); });
const setup = () => { HTMLDialogElement.prototype.showModal = vi.fn(function () { this.open = true; }); };
const button = text => [...document.querySelectorAll('.jn-confirm button')].find(b => b.textContent === text);

describe('application confirmation', () => {
    it('waits for a decision, escapes supplied text and rejects repeated actions', async () => {
        setup();
        const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
        const action = vi.fn();
        const first = confirmAction('<img src=x onerror=alert(1)>').then(accepted => accepted && action());
        expect(document.querySelector('.jn-confirm img')).toBeNull();
        expect(action).not.toHaveBeenCalled();
        expect(await confirmAction('second action')).toBe(false);
        button('确认继续').click(); await first;
        expect(action).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(trigger);
        expect(document.querySelector('.jn-confirm')).toBeNull();
    });
    it('cancel and Escape never execute a write', async () => {
        setup();
        const action = vi.fn();
        const first = confirmAction('删除？').then(value => value && action());
        button('取消').click(); await first;
        const second = confirmAction('再次删除？');
        document.querySelector('.jn-confirm').dispatchEvent(new Event('cancel', { cancelable:true }));
        expect(await second).toBe(false); expect(action).not.toHaveBeenCalled();
    });
    it('keeps form submitter and validation, cancellation does not submit', async () => {
        setup();
        const form = document.createElement('form'); form.dataset.jnConfirm = '删除？';
        const submitter = document.createElement('button'); submitter.type = 'submit'; submitter.name = 'action'; submitter.value = 'delete'; form.append(submitter); document.body.append(form);
        const request = vi.spyOn(form, 'requestSubmit').mockImplementation(() => {});
        bindFormConfirmations();
        const submit = () => form.dispatchEvent(new SubmitEvent('submit', { submitter, cancelable:true }));
        submit(); button('取消').click(); await Promise.resolve();
        expect(request).not.toHaveBeenCalled();
        submit(); submit(); button('确认继续').click(); await Promise.resolve();
        expect(request).toHaveBeenCalledExactlyOnceWith(submitter);
    });
});
