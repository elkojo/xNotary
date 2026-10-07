/** Save bytes to the user's device. Nothing is uploaded anywhere. */
export function downloadBytes(bytes: Uint8Array, fileName: string, mimeType: string): void {
  const blob = new Blob([bytes.slice()], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  // Revoke on the next frame so Safari has time to start the download.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/** `report.pdf` → `report`, so derived names do not stack extensions. */
export function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/**
 * Local time, with the zone named — see `localStamp`. Re-exported here because
 * this is where the views already import their formatting from.
 */
export { localStamp as formatDate } from './time';
