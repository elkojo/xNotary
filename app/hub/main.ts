import { mount } from 'svelte';

import '../src/app.css';
import '../src/site/site.css';
import Hub from './Hub.svelte';

/*
 * xNotary used to be this page. Its routes are hash routes, so the server
 * never sees `#/verify` and cannot redirect it: bookmarks, shared links and
 * installed apps all still arrive here with the route in the fragment. Carry
 * them to the address xNotary lives at now. The front page itself has no hash
 * routes, so a `#/…` here can only ever be an old xNotary address.
 *
 * An installed xNotary app whose manifest has not updated yet still opens `/`
 * in its own window — and iOS home-screen icons never update. In a standalone
 * window, this page is never what was meant.
 */
if (location.hash.startsWith('#/')) {
  location.replace(`/xnotary/${location.hash}`);
} else if (matchMedia('(display-mode: standalone)').matches) {
  location.replace('/xnotary/');
} else {
  mount(Hub, { target: document.getElementById('app')! });
}
