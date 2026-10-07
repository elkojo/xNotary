import { describe, expect, it } from 'vitest';
import { formatBytes } from './size';

describe('formatBytes', () => {
  it('writes small sizes in bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('keeps one decimal below ten, none above', () => {
    expect(formatBytes(8602)).toBe('8.4 KB');
    expect(formatBytes(88064)).toBe('86 KB');
    expect(formatBytes(1.2 * 1024 * 1024)).toBe('1.2 MB');
  });

  it('uses KB, not kB — binary multiples, as a file manager names them', () => {
    expect(formatBytes(13 * 1024)).toBe('13 KB');
  });
});
