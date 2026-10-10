// Keep the existing Bootstrap tab targets and permissions; only collect
// secondary tabs into the same navigation's dropdown.
export function bindSalesNavigation(root = document) {
    root.querySelectorAll('[data-jn-sales-tabs]').forEach(nav => {
        const tabs = [...nav.querySelectorAll('a[data-toggle="tab"]')];
        const selected = tabs.find(link => link.getAttribute('href') === location.hash);
        if (selected) {
            tabs.forEach(link => link.classList.toggle('active', link === selected));
            const panel = document.getElementById(location.hash.slice(1));
            if (panel) [...panel.parentElement.children].filter(el => el.classList.contains('tab-pane')).forEach(el => {
                el.classList.toggle('active', el === panel); el.classList.toggle('show', el === panel);
            });
        }
        const primary = new Set(nav.dataset.jnSalesTabs.split(' '));
        const secondary = [...nav.children].filter(item => {
            const link = item.querySelector('a[data-toggle="tab"]');
            return link && !primary.has(link.getAttribute('href'));
        });
        if (secondary.length) {
            const item = document.createElement('li');
            item.className = 'nav-item dropdown jn-sales-more';
            const toggle = document.createElement('a');
            toggle.className = 'nav-link dropdown-toggle';
            toggle.href = '#';
            toggle.dataset.toggle = 'dropdown';
            toggle.setAttribute('role', 'button');
            toggle.setAttribute('aria-haspopup', 'true');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.textContent = '更多';
            const menu = document.createElement('div');
            menu.className = 'dropdown-menu dropdown-menu-right';
            secondary.forEach(child => {
                const link = child.querySelector('a');
                link.classList.add('dropdown-item');
                if (link.classList.contains('active')) toggle.classList.add('active');
                menu.append(link);
                child.remove();
            });
            item.append(toggle, menu);
            nav.append(item);
        }
        const lines = nav.querySelector('a[href="#Lines"]');
        if (lines) {
            const label = lines.textContent.replace(/\s*\(\d+\)\s*$/, '').trim();
            window.addEventListener('jn-lines-count', event => {
                const count = event.detail?.count;
                if (Number.isInteger(count) && count >= 0) lines.textContent = `${label} (${count})`;
            });
        }
        // A fragment preserves the active tab across refresh and browser return.
        if (window.jQuery) window.jQuery(nav).on('shown.bs.tab', 'a[data-toggle="tab"]', event => {
            const hash = event.target.getAttribute('href');
            if (hash?.startsWith('#')) history.replaceState(history.state, '', `${location.pathname}${location.search}${hash}`);
        });
    });
}
