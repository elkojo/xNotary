import { describe, expect, it } from 'vitest';

import { C14N_10, C14N_11, C14N_EXCLUSIVE, canonicalize, isCanonicalization } from './c14n';
import { parseXml } from './fixtures.test-helper';

const render = (element: Element, algorithm = C14N_10, prefixes?: string[]): string =>
  new TextDecoder().decode(canonicalize(element, algorithm, prefixes));

const root = (xml: string): Element => parseXml(xml).documentElement;

describe('W3C Canonical XML, section 3.3: start and end tags', () => {
  // The spec's example, with its one DTD-defaulted attribute written out, since a
  // DOCTYPE is refused before anything reaches this code.
  const input = `<doc>
   <e1   />
   <e2   ></e2>
   <e3   name = "elem3"   id="elem3"   />
   <e4   name="elem4"   id="elem4"   ></e4>
   <e5 a:attr="out" b:attr="sorted" attr2="all" attr="I'm"
      xmlns:b="http://www.ietf.org"
      xmlns:a="http://www.w3.org"
      xmlns="http://example.org"/>
   <e6 xmlns="" xmlns:a="http://www.w3.org">
      <e7 xmlns="http://www.ietf.org">
         <e8 xmlns="" xmlns:a="http://www.w3.org">
            <e9 xmlns="" xmlns:a="http://www.ietf.org" attr="default"/>
         </e8>
      </e7>
   </e6>
</doc>`;

  const output = `<doc>
   <e1></e1>
   <e2></e2>
   <e3 id="elem3" name="elem3"></e3>
   <e4 id="elem4" name="elem4"></e4>
   <e5 xmlns="http://example.org" xmlns:a="http://www.w3.org" xmlns:b="http://www.ietf.org" attr="I'm" attr2="all" b:attr="sorted" a:attr="out"></e5>
   <e6 xmlns:a="http://www.w3.org">
      <e7 xmlns="http://www.ietf.org">
         <e8 xmlns="">
            <e9 xmlns:a="http://www.ietf.org" attr="default"></e9>
         </e8>
      </e7>
   </e6>
</doc>`;

  it('renders it exactly', () => {
    expect(render(root(input))).toBe(output);
  });
});

describe('W3C Canonical XML, section 3.4: character modifications', () => {
  it('escapes a carriage return in text and leaves a newline', () => {
    expect(render(root('<text>First line&#x0d;&#10;Second line</text>'))).toBe('<text>First line&#xD;\nSecond line</text>');
  });

  it('resolves character references', () => {
    expect(render(root('<value>&#x32;</value>'))).toBe('<value>2</value>');
  });

  it('turns CDATA into text', () => {
    expect(render(root('<compute><![CDATA[value>"0" && value<"10" ?"valid":"error"]]></compute>'))).toBe(
      '<compute>value&gt;"0" &amp;&amp; value&lt;"10" ?"valid":"error"</compute>',
    );
  });

  it('quotes an attribute with double quotes, escaping what has to be', () => {
    expect(render(root(`<compute expr='value>"0" &amp;&amp; value&lt;"10" ?"valid":"error"'>valid</compute>`))).toBe(
      '<compute expr="value>&quot;0&quot; &amp;&amp; value&lt;&quot;10&quot; ?&quot;valid&quot;:&quot;error&quot;">valid</compute>',
    );
  });
});

describe('a subtree of a larger document', () => {
  // The example from the Exclusive Canonicalization recommendation, section 2.2.
  const document = root(
    '<n0:local xmlns:n0="foo:bar" xmlns:n3="ftp://example.org"><n1:elem2 xmlns:n1="http://example.net" xml:lang="en"><n3:stuff xmlns:n3="ftp://example.org"/></n1:elem2></n0:local>',
  );
  const apex = document.firstChild as Element;

  it('inclusive: carries every namespace in scope', () => {
    expect(render(apex, C14N_10)).toBe(
      '<n1:elem2 xmlns:n0="foo:bar" xmlns:n1="http://example.net" xmlns:n3="ftp://example.org" xml:lang="en"><n3:stuff></n3:stuff></n1:elem2>',
    );
  });

  it('exclusive: carries only what is visibly used', () => {
    expect(render(apex, C14N_EXCLUSIVE)).toBe(
      '<n1:elem2 xmlns:n1="http://example.net" xml:lang="en"><n3:stuff xmlns:n3="ftp://example.org"></n3:stuff></n1:elem2>',
    );
  });

  it('exclusive: a PrefixList forces a namespace in as inclusive would', () => {
    expect(render(apex, C14N_EXCLUSIVE, ['n0'])).toBe(
      '<n1:elem2 xmlns:n0="foo:bar" xmlns:n1="http://example.net" xml:lang="en"><n3:stuff xmlns:n3="ftp://example.org"></n3:stuff></n1:elem2>',
    );
  });

  it('inclusive 1.0 inherits xml:* attributes from above the subtree, exclusive does not', () => {
    const inner = root('<a xml:lang="cs" xml:space="preserve"><b/></a>').firstChild as Element;
    expect(render(inner, C14N_10)).toBe('<b xml:lang="cs" xml:space="preserve"></b>');
    expect(render(inner, C14N_EXCLUSIVE)).toBe('<b></b>');
  });

  it('inclusive 1.1 does not inherit xml:id, 1.0 does', () => {
    const inner = root('<a xml:id="x" xml:lang="cs"><b/></a>').firstChild as Element;
    expect(render(inner, C14N_10)).toBe('<b xml:id="x" xml:lang="cs"></b>');
    expect(render(inner, C14N_11)).toBe('<b xml:lang="cs"></b>');
  });
});

describe('comments', () => {
  const withComment = root('<a><!-- note --><b/></a>');

  it('drops them from the plain variants', () => {
    expect(render(withComment)).toBe('<a><b></b></a>');
  });

  it('keeps them in the variants that say so', () => {
    expect(render(withComment, `${C14N_10}#WithComments`)).toBe('<a><!-- note --><b></b></a>');
  });
});

describe('what it will not guess at', () => {
  it('throws on an algorithm it does not know', () => {
    expect(isCanonicalization('urn:made-up')).toBe(false);
    expect(() => render(root('<a/>'), 'urn:made-up')).toThrow();
  });
});
