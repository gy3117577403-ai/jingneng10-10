import chinese from '../../lang/zh-CN.json';

// Translate authored UI text only. Do not pass user records, API field names,
// resource IDs or stored enum values through this presentation helper.
export function translateUiText(text, replacements = {}) {
    if (typeof text !== 'string') return text;
    const locale = globalThis.document?.documentElement?.lang || 'en';
    let result = locale.toLowerCase().startsWith('zh') ? (chinese[text] ?? text) : text;
    for (const [name, value] of Object.entries(replacements)) {
        result = result.replaceAll(`:${name}`, String(value));
    }
    return result;
}

export function uiLocale(fallback = 'fr-FR') {
    return globalThis.document?.documentElement?.lang || fallback;
}

export function uiCurrency(fallback = 'EUR') {
    return globalThis.document?.querySelector('meta[name="app-currency"]')?.content || fallback;
}
