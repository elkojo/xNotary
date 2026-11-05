/** Small things every reader of the container's XML needs. */
import type { ParseXml } from './types';

export const DS = 'http://www.w3.org/2000/09/xmldsig#';

const M = 'http://www.w3.org/2001/04/xmldsig-more#';

/** Digest algorithms a browser can compute, by the URI XML names them with. */
export const DIGESTS: Record<string, string> = {
  'http://www.w3.org/2000/09/xmldsig#sha1': 'SHA-1',
  'http://www.w3.org/2001/04/xmlenc#sha256': 'SHA-256',
  [`${M}sha384`]: 'SHA-384',
  'http://www.w3.org/2001/04/xmlenc#sha512': 'SHA-512',
};

export const decodeBase64 = (text: string): Uint8Array => {
  const binary = atob(text.replace(/\s+/g, ''));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

export const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);

export const digest = async (hash: string, bytes: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest(hash, bytes.slice().buffer as ArrayBuffer));

/** Direct children by local name and, when given, namespace. */
export function childrenNamed(parent: Element | Document, name: string, namespace?: string): Element[] {
  const found: Element[] = [];
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (child.nodeType !== 1) continue;
    const element = child as Element;
    if (element.localName === name && (!namespace || element.namespaceURI === namespace)) found.push(element);
  }
  return found;
}

export const childNamed = (parent: Element, name: string, namespace?: string): Element | undefined =>
  childrenNamed(parent, name, namespace)[0];

export function* descendantsOf(parent: Element): Generator<Element> {
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (child.nodeType !== 1) continue;
    yield child as Element;
    yield* descendantsOf(child as Element);
  }
}

export const descendantsNamed = (parent: Element, name: string): Element[] =>
  [...descendantsOf(parent)].filter((element) => element.localName === name);

/** The browser's parser. It reports malformed XML as a document, not an exception. */
export const parseInBrowser: ParseXml = (text) => {
  const parsed = new DOMParser().parseFromString(text, 'application/xml');
  if (parsed.getElementsByTagName('parsererror').length > 0) throw new Error('Not well-formed XML');
  return parsed;
};

/**
 * Bytes to a document, honouring the encoding the file declares.
 *
 * A DOCTYPE is refused outright. Nothing a signature needs can be in one, and an
 * entity or a defaulted attribute would change what canonicalization sees without
 * changing what a person reading the file sees.
 */
export function parseXmlBytes(bytes: Uint8Array, parse: ParseXml): Document {
  const prolog = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  const declared = /^﻿?<\?xml[^>]*encoding=["']([\w.-]+)["']/.exec(prolog)?.[1];

  let text: string;
  try {
    text = new TextDecoder(declared ?? 'utf-8').decode(bytes);
  } catch {
    text = new TextDecoder('utf-8').decode(bytes);
  }
  if (/<!DOCTYPE/i.test(text)) throw new Error('A DOCTYPE is not allowed here');

  const parsed = parse(text);
  if (!parsed.documentElement) throw new Error('Not well-formed XML');
  return parsed;
}
