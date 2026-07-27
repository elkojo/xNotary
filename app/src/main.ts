import { mount } from 'svelte';

import App from './App.svelte';
import './app.css';

// Offline-first: the shell is precached so verification of an already-saved
// certificate keeps working with no network. See vite.config.ts.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => {
        // A missing service worker only costs offline support; the app still runs.
      });
  });
}

export default mount(App, { target: document.getElementById('app')! });
