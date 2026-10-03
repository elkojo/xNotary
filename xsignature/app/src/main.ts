import { mount } from 'svelte';

import App from './App.svelte';
// The family's stylesheet and bar, from xNotary's app — one copy for the whole site.
import '../../../app/src/app.css';
import '../../../app/src/site/site.css';
import './shell.css';
import './signature.css';
import './document.css';

export default mount(App, { target: document.getElementById('app')! });
