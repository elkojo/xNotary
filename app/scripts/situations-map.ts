/**
 * Writes docs/situations-map.md from situations.ts (R8). `situations-export.test.ts` fails, and
 * so CI fails, whenever the committed copy differs from what this would write.
 *
 *   npm run situations:map
 */
import { writeFileSync } from 'node:fs';
import { situationsMap } from '../src/site/situations-export';

const file = new URL('../../docs/situations-map.md', import.meta.url);
writeFileSync(file, situationsMap());
console.log(`wrote ${file.pathname}`);
