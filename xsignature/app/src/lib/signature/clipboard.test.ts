import { afterEach, describe, expect, it, vi } from 'vitest';

import { clipboardCanBeRead, clipboardCanTakeImages, copyImage, copySvg, readSignatureFromClipboard } from './clipboard';

const original = {
  navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
  ClipboardItem: (globalThis as Record<string, unknown>).ClipboardItem,
};

function withClipboard(write: ((items: unknown[]) => Promise<void>) | null) {
  Object.defineProperty(globalThis, 'navigator', {
    value: write ? { clipboard: { write } } : {},
    configurable: true,
    writable: true,
  });
  (globalThis as Record<string, unknown>).ClipboardItem = write
    ? class {
        constructor(readonly items: Record<string, Blob>) {}
      }
    : undefined;
}

afterEach(() => {
  if (original.navigator) Object.defineProperty(globalThis, 'navigator', original.navigator);
  (globalThis as Record<string, unknown>).ClipboardItem = original.ClipboardItem;
});

const png = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });

describe('clipboardCanTakeImages', () => {
  it('is false where the browser has no ClipboardItem', () => {
    withClipboard(null);
    expect(clipboardCanTakeImages()).toBe(false);
  });

  it('is true where it does', () => {
    withClipboard(async () => {});
    expect(clipboardCanTakeImages()).toBe(true);
  });
});

describe('copyImage', () => {
  it('reports success when the write goes through', async () => {
    withClipboard(async () => {});
    expect(await copyImage(png)).toEqual({ ok: true });
  });

  it('passes the blob under its own media type', async () => {
    const write = vi.fn(async () => {});
    withClipboard(write);
    await copyImage(png);
    expect(write).toHaveBeenCalledTimes(1);
    const [[items]] = write.mock.calls as unknown as [[{ items: Record<string, Blob> }[]]];
    expect(Object.keys(items[0].items)).toEqual(['image/png']);
  });

  it('explains itself rather than throwing when there is no clipboard', async () => {
    withClipboard(null);
    const result = await copyImage(png);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/save the file instead/i);
  });

  it('says so when the browser refuses permission', async () => {
    // A denied copy and a click the browser thinks is stale raise the same
    // error, and the advice — try again, or save it — covers both.
    const denied = Object.assign(new Error('nope'), { name: 'NotAllowedError' });
    withClipboard(async () => {
      throw denied;
    });
    const result = await copyImage(png);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/did not allow/i);
  });

  it('never lets an unexpected failure escape', async () => {
    withClipboard(async () => {
      throw new Error('something else entirely');
    });
    await expect(copyImage(png)).resolves.toMatchObject({ ok: false });
  });
});

describe('copySvg', () => {
  const markup = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L9 9"/></svg>';

  it('offers the picture and the markup together', async () => {
    // Whoever pastes gets to choose: a design tool takes the vector, an editor
    // takes the source. Asking the user to pick first would mean asking before
    // they know where it is going.
    const write = vi.fn(async () => {});
    withClipboard(write);
    expect(await copySvg(markup)).toEqual({ ok: true });

    const [[items]] = write.mock.calls as unknown as [[{ items: Record<string, Blob> }[]]];
    expect(Object.keys(items[0].items).sort()).toEqual(['image/svg+xml', 'text/plain']);
  });

  it('falls back to the markup alone when the picture is refused', async () => {
    // Browsers have disagreed about image/svg+xml. Text on the clipboard is
    // still worth having, so a refusal must not come back as a failure.
    let attempt = 0;
    const write = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw Object.assign(new Error('no'), { name: 'NotAllowedError' });
    });
    withClipboard(write);

    expect(await copySvg(markup)).toEqual({ ok: true });
    expect(write).toHaveBeenCalledTimes(2);
    const second = write.mock.calls[1] as unknown as [{ items: Record<string, Blob> }[]];
    expect(Object.keys(second[0][0].items)).toEqual(['text/plain']);
  });

  it('gives up honestly when neither flavour is taken', async () => {
    withClipboard(async () => {
      throw Object.assign(new Error('no'), { name: 'NotAllowedError' });
    });
    const result = await copySvg(markup);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/save the file instead/i);
  });

  it('says so where there is no clipboard at all', async () => {
    withClipboard(null);
    await expect(copySvg(markup)).resolves.toMatchObject({ ok: false });
  });
});

/** A clipboard holding these flavours, readable the way the asynchronous API reads them. */
function holding(...entries: Record<string, Blob>[]) {
  const read = async () =>
    entries.map((e) => ({ types: Object.keys(e), getType: async (t: string) => e[t] }));
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { read } }, configurable: true, writable: true });
}

const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';

describe('readSignatureFromClipboard', () => {
  it('is offered only where the browser can read the clipboard', () => {
    withClipboard(null);
    expect(clipboardCanBeRead()).toBe(false);
    holding();
    expect(clipboardCanBeRead()).toBe(true);
  });

  it('prefers a picture over text, as the paste event does', async () => {
    holding({ 'text/plain': new Blob(['signature.png']) }, { 'image/png': png });
    const result = await readSignatureFromClipboard();
    expect(result).toEqual({ ok: true, blob: png, name: 'pasted image' });
  });

  it('takes SVG markup carried as text — how the signature screen copies', async () => {
    holding({ 'text/plain': new Blob([`  ${svg}\n`]) });
    const result = await readSignatureFromClipboard();
    expect(result.ok && result.name).toBe('pasted SVG');
    expect(result.ok && (await result.blob.text())).toBe(svg);
  });

  it('says so when the clipboard holds no signature', async () => {
    holding({ 'text/plain': new Blob(['just words']) });
    const result = await readSignatureFromClipboard();
    expect(result.ok).toBe(false);
  });

  it('turns a refusal into a sentence', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { read: async () => Promise.reject(new DOMException('no', 'NotAllowedError')) } },
      configurable: true,
      writable: true,
    });
    const result = await readSignatureFromClipboard();
    expect(result.ok === false && result.reason).toMatch(/did not allow/);
  });
});
