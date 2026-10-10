// A real asynchronous confirmation: callers must await the user's decision.
// Concurrent clicks are rejected rather than replaying the same write twice.
let pending = false;
export function confirmAction(message, { title = '确认操作', confirmLabel = '确认继续', cancelLabel = '取消' } = {}) {
    if (pending) return Promise.resolve(false);
    pending = true;
    return new Promise(resolve => {
        const previous = document.activeElement;
        const dialog = document.createElement('dialog');
        dialog.className = 'jn-confirm';
        dialog.setAttribute('aria-labelledby', 'jn-confirm-title');
        dialog.setAttribute('aria-describedby', 'jn-confirm-message');
        const heading = document.createElement('h2'); heading.id = 'jn-confirm-title'; heading.textContent = title;
        const text = document.createElement('p'); text.id = 'jn-confirm-message'; text.textContent = message || '请确认是否继续此操作。';
        const footer = document.createElement('footer');
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn btn-default'; cancel.textContent = cancelLabel;
        const confirm = document.createElement('button'); confirm.type = 'button'; confirm.className = 'btn btn-primary'; confirm.textContent = confirmLabel;
        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true; dialog.remove(); pending = false;
            if (previous?.isConnected) previous.focus();
            resolve(value);
        };
        cancel.addEventListener('click', () => finish(false));
        confirm.addEventListener('click', () => finish(true));
        dialog.addEventListener('cancel', e => { e.preventDefault(); finish(false); });
        dialog.addEventListener('close', () => finish(false));
        footer.append(cancel, confirm); dialog.append(heading, text, footer); document.body.append(dialog);
        if (typeof dialog.showModal !== 'function') { finish(false); return; }
        dialog.showModal(); cancel.focus();
    });
}

export function bindFormConfirmations(root = document) {
    root.querySelectorAll('form[data-jn-confirm]').forEach(form => {
        let approved = false, waiting = false;
        form.addEventListener('submit', async event => {
            if (approved) { approved = false; return; }
            event.preventDefault();
            if (waiting) return;
            waiting = true;
            const submitter = event.submitter;
            const accepted = await confirmAction(form.dataset.jnConfirm);
            waiting = false;
            if (!accepted || !form.isConnected) return;
            approved = true;
            form.requestSubmit(submitter?.isConnected ? submitter : undefined);
            approved = false;
        });
    });
}
