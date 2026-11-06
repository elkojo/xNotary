/**
 * A name out of a file, made safe to show.
 *
 * Bidirectional controls are how `exe.fdp` is made to read as `pdf.exe`, and how a certificate's
 * name is made to read as somebody else's. Both end up in front of a reader who trusts what they see.
 */
export function printable(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '\ufffd');
}
