// Drafts contain edited fields only, never files. Scoped to this account and tab;
// a changed server revision cannot silently overwrite a newer record.
const keyFor = scope => `jn.draft.${document.querySelector('meta[name="workspace-user"]')?.content || 'local'}.${scope}`;
export function readDraft(scope, revision) {
    try {
        const item = JSON.parse(sessionStorage.getItem(keyFor(scope)));
        return item && item.revision === revision && Date.now() - item.at < 86400000 ? item.values : null;
    } catch { return null; }
}
export function writeDraft(scope, revision, values) {
    try { sessionStorage.setItem(keyFor(scope), JSON.stringify({revision, values, at:Date.now()})); return true; } catch { return false; }
}
export function clearDraft(scope) { try { sessionStorage.removeItem(keyFor(scope)); } catch {} }
