/**
 * A file size as every service on the site writes it: binary multiples, with
 * the unit names people see in a file manager — `512 B`, `8.4 KB`, `86 KB`,
 * `1.2 MB`. One function, so the same file never reads as `86 KB` on one
 * screen and `86 kB` on the next.
 */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}
