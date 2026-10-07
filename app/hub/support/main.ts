import { mount } from 'svelte';

import '../../src/app.css';
import '../../src/site/site.css';
import Support from '../Support.svelte';

mount(Support, { target: document.getElementById('app')! });
