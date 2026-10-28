import { mount } from 'svelte';

import '../../src/app.css';
import '../../src/site/site.css';
import Situations from '../Situations.svelte';

mount(Situations, { target: document.getElementById('app')! });
