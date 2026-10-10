import _ from 'lodash';
import axios from 'axios';
import $ from 'jquery';
import 'bootstrap';

window._ = _;
// AdminLTE loads jQuery and its plugins before this module. Preserve that
// instance so Select2 and other legacy form widgets remain attached.
window.$ = window.jQuery = window.jQuery || $;

window.axios = axios;
window.axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

const csrfMeta = document.querySelector('meta[name="csrf-token"]');
if (csrfMeta) {
    window.axios.defaults.headers.common['X-CSRF-TOKEN'] = csrfMeta.content;
}

import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

window.Pusher = Pusher;

// Realtime is optional. A missing external Pusher key must not stop the app.
if (import.meta.env.VITE_PUSHER_APP_KEY) {
window.Echo = new Echo({
    broadcaster: 'pusher',
    key: import.meta.env.VITE_PUSHER_APP_KEY,
    cluster: import.meta.env.VITE_PUSHER_APP_CLUSTER,
    encrypted: true,
    forceTLS: true,
});
}
