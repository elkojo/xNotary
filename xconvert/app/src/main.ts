import { mount } from 'svelte';

import App from './App.svelte';
// The family's stylesheet and bar, from xNotary's app — one copy for the whole site.
import '../../../app/src/app.css';
import '../../../app/src/site/site.css';
import './shell.css';

export default mount(App, { target: document.getElementById('app')! });

// Offline once loaded: see the service worker in vite.config.ts.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
    // Without it xConvert still works; it just needs the network each visit.
  });
}
