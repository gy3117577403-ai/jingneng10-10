import {useEffect, useState} from 'react';

const choices = {
    state: ['', 'draft', 'pending', 'published', 'rejected', 'withdrawn'],
    kind: ['', 'ledger', 'file'], scope: ['all', 'created', 'review'],
    sort: ['updated', 'oldest', 'title', 'code'],
};
export function readLibraryQuery(search) {
    const params = new URLSearchParams(search);
    const query = {q: (params.get('q') || '').slice(0, 200), category: /^\d+$/.test(params.get('category') || '') ? params.get('category') : '', archived: params.get('archived') === '1', page: Math.max(1, Number.parseInt(params.get('list_page'), 10) || 1)};
    for (const [key, values] of Object.entries(choices)) query[key] = values.includes(params.get(key)) ? params.get(key) : values[0];
    return query;
}
export function useLibraryQuery() {
    const [query, setQuery] = useState(() => readLibraryQuery(location.search));
    useEffect(() => {
        const url = new URL(location.href);
        for (const [key, value] of Object.entries(query)) {
            // A cited document already uses "page". Keep list pagination separate.
            const name = key === 'page' ? 'list_page' : key;
            const omit = value === '' || value === false || (key === 'page' && value === 1) || (key === 'scope' && value === 'all') || (key === 'sort' && value === 'updated');
            if (omit) url.searchParams.delete(name);
            else url.searchParams.set(name, value === true ? '1' : String(value));
        }
        history.replaceState(null, '', url);
    }, [query]);
    useEffect(() => {
        const restore = () => setQuery(readLibraryQuery(location.search));
        window.addEventListener('popstate', restore);
        return () => window.removeEventListener('popstate', restore);
    }, []);
    return [query, patch => setQuery(previous => ({...previous, page: 1, ...patch})), page => setQuery(previous => ({...previous, page: typeof page === 'function' ? page(previous.page) : page}))];
}
