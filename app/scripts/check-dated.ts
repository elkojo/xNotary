/**
 * Fails when a provider example on /situations/ is older than the release allows.
 * Run by deploy.yml with the tagged commit's date: `vite-node scripts/check-dated.ts <ISO date>`.
 */
import { EXAMPLE_MAX_AGE_DAYS } from '../src/site/situations';
import { staleExamples } from '../src/site/situations-dates';

const at = new Date(process.argv[2] ?? Date.now());
if (Number.isNaN(at.getTime())) throw new Error(`Not a date: ${process.argv[2]}`);
const stale = staleExamples(at);
for (const s of stale)
  console.error(`::error::${s.node}: the example "${s.name}" was checked on ${s.checked}, ${s.days} days before this commit (limit ${EXAMPLE_MAX_AGE_DAYS}). Read its site again and update the date.`);
if (stale.length) process.exit(1);
console.log(`every provider example was checked within ${EXAMPLE_MAX_AGE_DAYS} days of ${at.toISOString().slice(0, 10)}`);
