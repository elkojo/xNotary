import { describe, expect, it } from 'vitest';

import type { Outgoing } from './apply';
import { TimestampUnreachable } from './fetch';
import { askInTurn, type Candidate, type InTurnDeps } from './in-turn';
import { TimestampRefused, type Timestamp } from './response';

const DIGEST = new Uint8Array(32).fill(9);

const A: Candidate = { name: 'Alpha', url: 'https://a.example/tsr' };
const B: Candidate = { name: 'Beta', url: 'https://b.example/tsr' };
const C: Candidate = { name: 'Gamma', url: 'https://c.example/tsr' };

/** A network where each address either answers or fails the given way. */
function network(behaviour: Record<string, Error | 'answers'>) {
  const asked: string[] = [];
  const deps: InTurnDeps = {
    fetch: async (url) => {
      asked.push(url);
      const outcome = behaviour[url];
      if (outcome instanceof Error) throw outcome;
      return new TextEncoder().encode(url);
    },
    read: (reply): Timestamp => ({
      token: reply,
      time: new Date('2026-10-12T10:00:00Z'),
      policy: '1.2.3',
      accuracySeconds: null,
    }),
  };
  return { asked, deps };
}

describe('askInTurn', () => {
  it('stops at the first that answers, and asks nobody after it', async () => {
    const { asked, deps } = network({ [A.url]: 'answers', [B.url]: 'answers' });
    const result = await askInTurn([A, B, C], DIGEST, {}, deps);
    expect(result.by).toBe(A);
    expect(result.passed).toEqual([]);
    expect(asked).toEqual([A.url]);
  });

  it('moves on when one cannot be reached, and names who answered instead', async () => {
    const { asked, deps } = network({
      [A.url]: new TimestampUnreachable('The timestamp authority could not be reached. More.'),
      [B.url]: 'answers',
    });
    const result = await askInTurn([A, B, C], DIGEST, {}, deps);
    expect(result.by).toBe(B);
    expect(result.passed).toEqual([
      { name: 'Alpha', reason: 'The timestamp authority could not be reached. More.' },
    ]);
    expect(asked).toEqual([A.url, B.url]);
  });

  it('moves on when a reply does not answer the request', async () => {
    const { deps } = network({ [A.url]: new TimestampRefused('Wrong nonce.'), [B.url]: 'answers' });
    expect((await askInTurn([A, B], DIGEST, {}, deps)).by).toBe(B);
  });

  it('does not swallow a failure that is not the authority’s', async () => {
    const { asked, deps } = network({ [A.url]: new TypeError('a bug here'), [B.url]: 'answers' });
    await expect(askInTurn([A, B], DIGEST, {}, deps)).rejects.toThrow(TypeError);
    expect(asked).toEqual([A.url]);
  });

  it('names every authority when none answers', async () => {
    const { deps } = network({
      [A.url]: new TimestampUnreachable('Alpha is down. The document has not been changed.'),
      [B.url]: new TimestampRefused('Beta refused.'),
    });
    await expect(askInTurn([A, B], DIGEST, {}, deps)).rejects.toThrow(
      'None of the 2 authorities answered: Alpha — Alpha is down; Beta — Beta refused.',
    );
  });

  it('passes a single authority’s own failure through unchanged', async () => {
    const own = new TimestampUnreachable('Alpha is down. The document has not been changed.');
    const { deps } = network({ [A.url]: own });
    await expect(askInTurn([A], DIGEST, {}, deps)).rejects.toBe(own);
  });

  it('reports each request before it goes, with the same digest every time', async () => {
    const { deps } = network({ [A.url]: new TimestampRefused('No.'), [B.url]: 'answers' });
    const outgoing: Outgoing[] = [];
    await askInTurn([A, B], DIGEST, { onOutgoing: (o) => outgoing.push(o) }, deps);
    expect(outgoing.map((o) => o.authority)).toEqual(['Alpha', 'Beta']);
    expect(outgoing.map((o) => o.url)).toEqual([A.url, B.url]);
    expect(new Set(outgoing.map((o) => o.digestHex)).size).toBe(1);
    expect(outgoing[0].digestHex).toBe('09'.repeat(32));
  });
});
