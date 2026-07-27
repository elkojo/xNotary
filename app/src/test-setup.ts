/**
 * Node 18 does not expose `globalThis.crypto` (it arrived in Node 19). Browsers
 * always have it, so this shim exists purely so the test runner matches the
 * production runtime. Nothing in `src/lib` may depend on `node:crypto`.
 */
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
