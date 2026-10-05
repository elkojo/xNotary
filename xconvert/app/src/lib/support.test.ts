import { PROBE_FOR_TESTS, canRunPandoc } from './support';
import { vendored } from './binaries.test-helper';

describe('canRunPandoc', () => {
  it('asks with a module that is otherwise valid', () => {
    // The same module with `nop` where the try_table block was validates anywhere, so a
    // `false` from the probe can only mean the instruction is unsupported.
    const header = PROBE_FOR_TESTS.slice(0, 18); // magic, version, type and function sections
    const withNop = new Uint8Array([...header, 0x0a, 0x05, 0x01, 0x03, 0x00, 0x01, 0x0b]);
    expect(WebAssembly.validate(withNop)).toBe(true);
  });

  it('agrees with pandoc itself about this runtime', async () => {
    const compiles = await WebAssembly.compile(vendored('pandoc.wasm.gz')).then(
      () => true,
      () => false,
    );
    expect(canRunPandoc()).toBe(compiles);
  });
});
