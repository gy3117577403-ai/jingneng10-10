import { useEffect, useRef } from 'react';
const keyFor = scope => `jn.list.${document.querySelector('meta[name="workspace-user"]')?.content || 'local'}.${scope}`;
export function readListContext(scope) { try {return JSON.parse(sessionStorage.getItem(keyFor(scope))) || {};} catch {return {};} }
export function saveListContext(scope, value) { try {sessionStorage.setItem(keyFor(scope),JSON.stringify({...readListContext(scope),...value}));} catch {} }
export function useListScroll(scope, ready) {
    const restored = useRef(false);
    useEffect(()=>{if(ready&&!restored.current){restored.current=true;const frame=requestAnimationFrame(()=>{const top=readListContext(scope).scroll;if(top)window.scrollTo({top,behavior:'instant'});});return()=>cancelAnimationFrame(frame);}},[ready,scope]);
    useEffect(()=>{const save=()=>saveListContext(scope,{scroll:window.scrollY});window.addEventListener('pagehide',save);return()=>window.removeEventListener('pagehide',save);},[scope]);
}
