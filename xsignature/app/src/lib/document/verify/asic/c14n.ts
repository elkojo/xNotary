/**
 * Canonical XML: the exact bytes an XML signature was computed over.
 *
 * An XML signature does not sign the file. It signs one fixed rendering of part
 * of its parse tree, so that re-indenting or re-quoting cannot break it. That
 * rendering has three versions in use and all three occur in real containers:
 * inclusive 1.0, inclusive 1.1 and exclusive. It works on any DOM, so the browser
 * and the test suite run the same code over different parsers.
 *
 * A mistake here cannot make a forgery pass, because the digest would have to
 * collide; it makes a good signature read as broken. W3C's own examples pin it in
 * `c14n.test.ts`.
 *
 * Only subtrees are handled, which is all a signature ever references, and
 * comments are simply dropped by the plain variants. What 1.1 adds over 1.0 for a
 * subset is not joining `xml:base` across a gap, and it is not done: a container's
 * signed elements do not carry one, and one that did would fail safe as above.
 */
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

interface Variant {
  readonly exclusive?: boolean;
  readonly comments?: boolean;
  readonly v11?: boolean;
}

export const C14N_10 = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
export const C14N_11 = 'http://www.w3.org/2006/12/xml-c14n11';
export const C14N_EXCLUSIVE = 'http://www.w3.org/2001/10/xml-exc-c14n#';

const VARIANTS: Record<string, Variant> = {
  [C14N_10]: {},
  [`${C14N_10}#WithComments`]: { comments: true },
  [C14N_11]: { v11: true },
  [`${C14N_11}#WithComments`]: { v11: true, comments: true },
  [C14N_EXCLUSIVE]: { exclusive: true },
  [`${C14N_EXCLUSIVE}WithComments`]: { exclusive: true, comments: true },
};

export const isCanonicalization = (algorithm: string): boolean => algorithm in VARIANTS;

const escapeText = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;');

const escapeAttribute = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/\t/g, '&#x9;')
    .replace(/\n/g, '&#xA;')
    .replace(/\r/g, '&#xD;');

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const isNamespaceDeclaration = (attribute: Attr): boolean =>
  attribute.namespaceURI === XMLNS_NS || attribute.name === 'xmlns' || attribute.name.startsWith('xmlns:');

const declaredPrefix = (attribute: Attr): string =>
  attribute.name === 'xmlns' ? '' : attribute.name.slice('xmlns:'.length);

function attributesOf(element: Element): Attr[] {
  const found: Attr[] = [];
  for (let i = 0; i < element.attributes.length; i++) found.push(element.attributes[i]);
  return found;
}

/**
 * Render a subtree. `prefixes` is an exclusive `InclusiveNamespaces` PrefixList,
 * meaningless to the other two.
 *
 * Throws on an algorithm it does not know: guessing one would turn "cannot check
 * this" into "this is broken".
 */
export function canonicalize(apex: Element, algorithm: string, prefixes: readonly string[] = []): Uint8Array {
  const variant = VARIANTS[algorithm];
  if (!variant) throw new Error(`Unknown canonicalization: ${algorithm}`);

  // What the subtree inherits from the document it sits in.
  const inherited = new Map<string, string>();
  const inheritedXml = new Map<string, Attr>();
  const ancestors: Element[] = [];
  for (let node = apex.parentNode; node && node.nodeType === 1; node = node.parentNode) {
    ancestors.unshift(node as Element);
  }
  for (const ancestor of ancestors) {
    for (const attribute of attributesOf(ancestor)) {
      if (isNamespaceDeclaration(attribute)) {
        inherited.set(declaredPrefix(attribute), attribute.value);
      } else if (!variant.exclusive && attribute.namespaceURI === XML_NS) {
        if (!(variant.v11 && (attribute.localName === 'id' || attribute.localName === 'base'))) {
          inheritedXml.set(attribute.localName ?? attribute.name, attribute);
        }
      }
    }
  }

  const forced = new Set(prefixes.map((prefix) => (prefix === '#default' ? '' : prefix)));
  let out = '';

  const render = (element: Element, parentScope: Map<string, string>, parentOutput: Map<string, string>, isApex: boolean): void => {
    const scope = new Map(parentScope);
    const own: Attr[] = [];
    for (const attribute of attributesOf(element)) {
      if (isNamespaceDeclaration(attribute)) scope.set(declaredPrefix(attribute), attribute.value);
      else own.push(attribute);
    }

    let candidates: Array<[string, string]>;
    if (variant.exclusive) {
      const used = new Set<string>([element.prefix ?? '']);
      for (const attribute of own) {
        if (attribute.prefix && attribute.prefix !== 'xml') used.add(attribute.prefix);
      }
      for (const prefix of forced) if (scope.has(prefix)) used.add(prefix);
      candidates = [...used].map((prefix) => [prefix, scope.get(prefix) ?? '']);
    } else {
      candidates = [...scope.entries()];
    }

    const output = new Map(parentOutput);
    const declarations: Array<[string, string]> = [];
    for (const [prefix, uri] of candidates) {
      if (prefix === 'xml') continue;
      // `xmlns=""` only means something when it undoes a default in force.
      if (prefix === '' && uri === '' && !output.get('')) continue;
      if (output.get(prefix) === uri) continue;
      output.set(prefix, uri);
      declarations.push([prefix, uri]);
    }
    declarations.sort((a, b) => compare(a[0], b[0]));

    const attributes = [...own];
    if (isApex) {
      for (const [localName, attribute] of inheritedXml) {
        if (!own.some((candidate) => candidate.namespaceURI === XML_NS && candidate.localName === localName)) {
          attributes.push(attribute);
        }
      }
    }
    attributes.sort(
      (a, b) => compare(a.namespaceURI ?? '', b.namespaceURI ?? '') || compare(a.localName ?? a.name, b.localName ?? b.name),
    );

    const name = element.nodeName;
    out += `<${name}`;
    for (const [prefix, uri] of declarations) {
      out += `${prefix ? ` xmlns:${prefix}` : ' xmlns'}="${escapeAttribute(uri)}"`;
    }
    for (const attribute of attributes) out += ` ${attribute.name}="${escapeAttribute(attribute.value)}"`;
    out += '>';

    for (let child = element.firstChild; child; child = child.nextSibling) {
      switch (child.nodeType) {
        case 1:
          render(child as Element, scope, output, false);
          break;
        case 3:
        case 4:
          out += escapeText((child as CharacterData).data);
          break;
        case 7: {
          const instruction = child as ProcessingInstruction;
          out += `<?${instruction.target}${instruction.data ? ` ${instruction.data}` : ''}?>`;
          break;
        }
        case 8:
          if (variant.comments) out += `<!--${(child as Comment).data}-->`;
          break;
      }
    }
    out += `</${name}>`;
  };

  render(apex, inherited, new Map(), true);
  return new TextEncoder().encode(out);
}
