/**
 * Which dated facts in situations.ts are too old to ship. Provider examples (R3) carry the day
 * their site was read, and a release may not carry one older than EXAMPLE_MAX_AGE_DAYS — the
 * same discipline as the trusted lists' 10 days, measured the same way, from the tagged commit
 * (scripts/check-dated.ts, run by deploy.yml), so re-running an old tag still works.
 */
import { EXAMPLE_MAX_AGE_DAYS, NODES, type Outcome } from './situations';

export interface Stale {
  readonly node: string;
  readonly name: string;
  readonly checked: string;
  readonly days: number;
}

const DAY = 86_400_000;

export function staleExamples(at: Date, maxDays = EXAMPLE_MAX_AGE_DAYS): Stale[] {
  const stale: Stale[] = [];
  for (const [node, n] of Object.entries(NODES)) {
    if (n.kind !== 'outcome') continue;
    for (const e of (n as Outcome).examples ?? []) {
      const days = Math.floor((at.getTime() - Date.parse(`${e.checked}T00:00:00Z`)) / DAY);
      if (days > maxDays) stale.push({ node, name: e.name, checked: e.checked, days });
    }
  }
  return stale;
}
