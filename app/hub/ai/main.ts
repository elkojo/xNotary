import { mount } from 'svelte';

import '../../src/app.css';
import '../../src/site/site.css';
import Ai from '../Ai.svelte';

mount(Ai, { target: document.getElementById('app')! });
