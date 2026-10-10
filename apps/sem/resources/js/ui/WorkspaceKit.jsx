import React, { useId, useRef } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';

export const userKey = key => `jn.${document.querySelector('meta[name="workspace-user"]')?.content || 'local'}.${key}`;
export function readPreference(key, fallback) { try { const value = JSON.parse(localStorage.getItem(userKey(key))); return value ?? fallback; } catch { return fallback; } }
export function savePreference(key, value) { try { localStorage.setItem(userKey(key), JSON.stringify(value)); } catch { /* Optional device preferences. */ } }

export function Segments({ value, onChange, items, label, className = '' }) {
    const group = useId(), reduced = useReducedMotion();
    return <LayoutGroup id={group}><div className={`jn-segments ${className}`} role="tablist" aria-label={label}>
        {items.map(([key, title]) => <button key={key} type="button" role="tab" tabIndex={key === value ? 0 : -1} aria-selected={key === value} onClick={() => onChange(key)}
            onKeyDown={event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault(); const index = items.findIndex(([id]) => id === key);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
                onChange(items[next][0]); event.currentTarget.parentElement.children[next].focus();
            }}>
            {key === value && <motion.span className="jn-segment-highlight" layoutId="selected" transition={{duration:reduced ? 0 : .18}} />}
            <span>{title}</span>
        </button>)}
    </div></LayoutGroup>;
}

export function SurfaceDialog({ open = true, onClose, title, children, className = '', initialFocus, finalFocus, modal = true }) {
    const closeRef = useRef(null);
    return <Dialog.Root open={open} onOpenChange={next => { if (!next) onClose(); }} modal={modal}>
        <Dialog.Portal>
            {modal && <Dialog.Backdrop className="jn-backdrop" />}
            <Dialog.Popup className={`jn-surface-dialog ${className}`} initialFocus={initialFocus || closeRef} finalFocus={finalFocus}>
                <header className="jn-dialog-heading"><Dialog.Title>{title}</Dialog.Title>
                    <Dialog.Close ref={closeRef} className="jn-icon-button" aria-label="关闭窗口"><X size={18}/></Dialog.Close>
                </header>
                {children}
            </Dialog.Popup>
        </Dialog.Portal>
    </Dialog.Root>;
}

export function Entrance({ children, className = '' }) {
    const reduced = useReducedMotion();
    return <motion.div className={className} initial={reduced ? false : {opacity:0,y:5}} animate={{opacity:1,y:0}} transition={{duration:.18}}>{children}</motion.div>;
}
