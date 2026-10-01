import { describe, expect, spyOn, test } from "bun:test";
import type { ReactElement, ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { hyphenate, processSegments } from "../src";
import { Hyphenate, Typeset, transformChildren } from "../src/react";

const SHY = "­";
const NB = "\u00A0";
const LONG = "Hraðbrautarframkvæmdir";
const HEADING_WORD = "Vaðlaheiðarvegavinnuverkfærageymsluskúr";

function render(node: ReactNode): string {
  return renderToStaticMarkup(node);
}

describe("<Hyphenate>", () => {
  test("inserts soft hyphens into paragraph text", () => {
    const html = render(
      <Hyphenate>
        <p>{LONG} eru miklar</p>
      </Hyphenate>
    );
    expect(html).toContain(SHY);
    expect(html.replaceAll(SHY, "")).toBe(`<p>${LONG} eru miklar</p>`);
    expect(html).toBe(`<p>${hyphenate(`${LONG} eru miklar`)}</p>`);
  });

  test("renders no wrapper element", () => {
    const html = render(
      <Hyphenate>
        <p>ok</p>
      </Hyphenate>
    );
    expect(html).toBe("<p>ok</p>");
  });

  test("leaves code and pre untouched", () => {
    const html = render(
      <Hyphenate>
        <p>
          {LONG} <code>{LONG} "x"</code>
        </p>
        <pre>{LONG}</pre>
      </Hyphenate>
    );
    expect(html).toContain(`<code>${LONG} &quot;x&quot;</code>`);
    expect(html).toContain(`<pre>${LONG}</pre>`);
    expect(html).toContain(SHY);
  });

  test.each(["kbd", "samp", "var"] as const)("leaves <%s> untouched", Tag => {
    const html = render(
      <Hyphenate>
        <Tag>{LONG}</Tag>
      </Hyphenate>
    );
    expect(html).not.toContain(SHY);
  });

  test("leaves data-skiptingar=off and translate=no subtrees untouched", () => {
    const html = render(
      <Hyphenate>
        <div data-skiptingar="off">
          <p>{LONG}</p>
        </div>
        <span translate="no">{LONG}</span>
        <p>{LONG}</p>
      </Hyphenate>
    );
    expect(html).toContain(`<div data-skiptingar="off"><p>${LONG}</p></div>`);
    expect(html).toContain(`<span translate="no">${LONG}</span>`);
    expect(html.split(SHY).length).toBeGreaterThan(1);
    expect(html).toContain(`<p>${hyphenate(LONG)}</p>`);
  });

  test("pairs quotes across an inline element", () => {
    const html = render(
      <Hyphenate>
        <p>
          Hann sagði "<strong>orð</strong>" og fór
        </p>
      </Hyphenate>
    );
    expect(html).toContain("„<strong>orð</strong>“");
  });

  test("transforms the children prop of a component, not its own output", () => {
    function Card({ children }: { children?: ReactNode }) {
      return (
        <section>
          {children}
          <b>{LONG}</b>
        </section>
      );
    }
    const html = render(
      <Hyphenate>
        <Card>
          <p>{LONG}</p>
        </Card>
      </Hyphenate>
    );
    expect(html).toContain(`<p>${hyphenate(LONG)}</p>`);
    expect(html).toContain(`<b>${LONG}</b>`);
  });

  test("never calls a component", () => {
    let calls = 0;
    function Counter({ children }: { children?: ReactNode }) {
      calls += 1;
      return <>{children}</>;
    }
    const tree = (
      <Counter>
        <p>{LONG}</p>
      </Counter>
    );
    transformChildren(tree, { hyphenate: {} });
    expect(calls).toBe(0);
  });

  test("leaves attributes untouched", () => {
    const html = render(
      <Hyphenate>
        <a aria-label={LONG} href="/x" title={LONG}>
          {LONG}
        </a>
        <input alt={LONG} type="image" />
      </Hyphenate>
    );
    expect(html).toContain(`aria-label="${LONG}"`);
    expect(html).toContain(`title="${LONG}"`);
    expect(html).toContain(`alt="${LONG}"`);
    expect(html).toContain(`>${hyphenate(LONG)}</a>`);
  });

  test("keeps keys and other props, with no React warnings", () => {
    const spy = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const items = ["Fyrsta", "Önnur", "Þriðja"].map(name => (
        <li className="row" data-id={name} key={name}>
          {name} {LONG}
        </li>
      ));
      const html = renderToStaticMarkup(
        <Hyphenate>
          <h2>
            Fyrirsögn <em>með</em> {LONG}
          </h2>
          <ul>{items}</ul>
          <p>
            Texti <a href="/x">tengill</a> og <strong>feitletrað</strong> {LONG}
          </p>
        </Hyphenate>
      );
      expect(html).toContain('<li class="row" data-id="Önnur">');
      expect(html).toContain('<a href="/x">teng');
      expect(html).toContain(SHY);
      expect(spy).not.toHaveBeenCalled();

      const walked = transformChildren(<ul>{items}</ul>, { hyphenate: {} });
      const ul = walked as ReactElement<{ children: ReactElement[] }>;
      expect(ul.props.children.map(li => li.key)).toEqual(["Fyrsta", "Önnur", "Þriðja"]);
    } finally {
      spy.mockRestore();
    }
  });

  test("typeset={false} leaves straight quotes and hyphenates", () => {
    const html = render(
      <Hyphenate typeset={false}>
        <p>Hann sagði "orð" um {LONG}</p>
      </Hyphenate>
    );
    expect(html).toContain("&quot;orð&quot;");
    expect(html).not.toContain("„");
    expect(html).toContain(SHY);
  });

  test("accepts typeset options", () => {
    const html = render(
      <Hyphenate typeset={{ quotes: false }}>
        <p>Hann sagði "orð"</p>
      </Hyphenate>
    );
    expect(html).toContain("&quot;orð&quot;");
  });

  test("heading mode gives the same breaks as hyphenate()", () => {
    const html = render(
      <Hyphenate mode="heading">
        <h1>{HEADING_WORD}</h1>
      </Hyphenate>
    );
    const expected = hyphenate(HEADING_WORD, { mode: "heading" });
    expect(expected).toContain(SHY);
    expect(html).toBe(`<h1>${expected}</h1>`);
  });

  test("works over a mix of block elements", () => {
    const html = render(
      <Hyphenate>
        <h2>{LONG}</h2>
        <p>{LONG}</p>
        <ul>
          <li>{LONG}</li>
          <li>{LONG}</li>
        </ul>
      </Hyphenate>
    );
    expect(html.split(SHY).length - 1).toBeGreaterThanOrEqual(4);
    expect(html.replaceAll(SHY, "")).toBe(
      `<h2>${LONG}</h2><p>${LONG}</p><ul><li>${LONG}</li><li>${LONG}</li></ul>`
    );
  });

  test("passes numbers and empty children through", () => {
    expect(render(<Hyphenate>{5}</Hyphenate>)).toBe("5");
    expect(render(<Hyphenate>{null}</Hyphenate>)).toBe("");
    expect(transformChildren(5, { hyphenate: {} })).toBe(5);
  });

  test("does not change a tree when both options are off", () => {
    const tree = <p>{LONG}</p>;
    expect(transformChildren(tree, {})).toBe(tree);
  });
});

describe("component children shape", () => {
  function List({ children }: { children: string[] }) {
    return (
      <ul>
        {children.map(child => (
          <li key={child}>{child}</li>
        ))}
      </ul>
    );
  }

  test("a one-item array child stays an array", () => {
    const tree = <List>{[LONG]}</List>;
    const walked = transformChildren(tree, { hyphenate: {} });
    expect(render(walked)).toBe(`<ul><li>${hyphenate(LONG)}</li></ul>`);
    expect((walked as ReactElement<{ children: unknown }>).props.children).toEqual([
      hyphenate(LONG),
    ]);
  });

  test("an empty array child stays an array", () => {
    const walked = transformChildren(<List>{[]}</List>, { hyphenate: {} });
    expect(render(walked)).toBe("<ul></ul>");
  });

  test("array children of a component cause no key warnings", () => {
    const spy = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      function Box({ children }: { children?: ReactNode }) {
        return <div>{children}</div>;
      }
      const html = renderToStaticMarkup(
        <Hyphenate>
          <Box>
            <p>{LONG}</p>
            <p>{LONG}</p>
          </Box>
        </Hyphenate>
      );
      expect(html).toContain(SHY);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("web addresses split across inline elements", () => {
  test("a domain split by an element is left alone", () => {
    const html = render(
      <Hyphenate>
        <a href="x">
          <em>hraðbrautarframkvæmdir</em>.is
        </a>
      </Hyphenate>
    );
    expect(html).toBe('<a href="x"><em>hraðbrautarframkvæmdir</em>.is</a>');
  });

  test("the unsplit domain is left alone too", () => {
    const html = render(
      <Hyphenate>
        <p>hraðbrautarframkvæmdir.is</p>
      </Hyphenate>
    );
    expect(html).toBe("<p>hraðbrautarframkvæmdir.is</p>");
  });

  test("normal words next to an inline element are still hyphenated", () => {
    const html = render(
      <Hyphenate>
        <p>
          {LONG} <em>{LONG}</em>
        </p>
      </Hyphenate>
    );
    expect(html).toBe(`<p>${hyphenate(LONG)} <em>${hyphenate(LONG)}</em></p>`);
  });

  test("text before and after a split domain is still hyphenated", () => {
    const html = render(
      <Hyphenate>
        <p>
          {LONG} á <em>hraðbrautarframkvæmdir</em>.is og {LONG}
        </p>
      </Hyphenate>
    );
    expect(html).toBe(
      `<p>${hyphenate(LONG)} á <em>hraðbrautarframkvæmdir</em>.is og ${hyphenate(LONG)}</p>`
    );
  });
});

describe("block boundaries", () => {
  test("a word after a block is not read as a domain with the sentence before", () => {
    const html = render(
      <Hyphenate>
        <div>
          <p>Ferðir og afþreying.</p>
        </div>
        <div>
          <h4>Sveitarstjórnarkosningar</h4>
        </div>
      </Hyphenate>
    );
    const word = hyphenate("Sveitarstjórnarkosningar");
    expect(word).toContain(SHY);
    expect(html).toContain(`<h4>${word}</h4>`);
  });

  test("quotes do not pair across paragraphs", () => {
    const html = render(
      <Typeset>
        <p>"a</p>
        <p>b"</p>
      </Typeset>
    );
    expect(html).toBe("<p>&quot;a</p><p>b&quot;</p>");
  });

  test("quotes still pair across an inline element", () => {
    const html = render(
      <Typeset>
        <p>
          "<strong>orð</strong>"
        </p>
      </Typeset>
    );
    expect(html).toBe("<p>„<strong>orð</strong>“</p>");
  });

  test("a split domain inside one block stays protected", () => {
    const html = render(
      <Hyphenate>
        <p>
          <a href="x">
            <em>hraðbrautarframkvæmdir</em>.is
          </a>
        </p>
      </Hyphenate>
    );
    expect(html).toBe('<p><a href="x"><em>hraðbrautarframkvæmdir</em>.is</a></p>');
  });

  test("lastWords binds only inside each block", () => {
    const html = render(
      <Typeset lastWords>
        <p>Þetta er lína</p>
        <p>Önnur góð lína</p>
      </Typeset>
    );
    expect(html).toBe(`<p>Þetta er${NB}lína</p><p>Önnur góð${NB}lína</p>`);
  });

  test("a <br> separates runs", () => {
    const html = render(
      <Typeset>
        <p>
          "a
          <br />
          b"
        </p>
      </Typeset>
    );
    expect(html).toBe("<p>&quot;a<br/>b&quot;</p>");
  });

  test("unknown tags are blocks and components are transparent", () => {
    function Wrap({ children }: { children?: ReactNode }) {
      return <>{children}</>;
    }
    const custom = render(
      <Typeset>
        {createElement("x-card", null, '"a')}
        {createElement("x-card", null, 'b"')}
      </Typeset>
    );
    expect(custom).toBe("<x-card>&quot;a</x-card><x-card>b&quot;</x-card>");
    const through = render(
      <Typeset>
        <p>
          "<Wrap>orð</Wrap>"
        </p>
      </Typeset>
    );
    expect(through).toBe("<p>„orð“</p>");
  });
});

describe("lang", () => {
  test("a foreign-language span is left alone, Icelandic words are hyphenated", () => {
    const html = render(
      <Hyphenate>
        <p>
          {LONG} <span lang="en">international</span> {LONG}
        </p>
      </Hyphenate>
    );
    expect(html).toBe(
      `<p>${hyphenate(LONG)} <span lang="en">international</span> ${hyphenate(LONG)}</p>`
    );
    expect(hyphenate("international")).toContain(SHY);
  });

  test("the example sentence from the spelling rules", () => {
    const html = render(
      <Hyphenate>
        <p>
          Orðið <span lang="en">international</span> er enskt
        </p>
      </Hyphenate>
    );
    expect(html).toContain('<span lang="en">international</span>');
  });

  test("lang=en-GB is skipped and lang=IS, is-IS are processed", () => {
    const html = render(
      <Hyphenate>
        <p lang="en-GB">{LONG}</p>
        <p lang="IS">{LONG}</p>
        <p lang="is-IS">{LONG}</p>
      </Hyphenate>
    );
    expect(html).toBe(
      `<p lang="en-GB">${LONG}</p><p lang="IS">${hyphenate(LONG)}</p><p lang="is-IS">${hyphenate(LONG)}</p>`
    );
  });

  test("a nested lang=is turns processing back on", () => {
    const html = render(
      <Hyphenate>
        <p>
          <span lang="en">
            international <span lang="is">Sveitarstjórnarkosningar</span> international
          </span>
        </p>
      </Hyphenate>
    );
    expect(html).toContain(
      `<span lang="is">${hyphenate("Sveitarstjórnarkosningar")}</span>`
    );
    expect(html.split("international").length).toBe(3);
    expect(html).not.toContain(`inter${SHY}`);
  });

  test("the lang prop of a component is its own, not a language", () => {
    function Code({ children }: { children?: ReactNode; lang?: string }) {
      return <b>{children}</b>;
    }
    const tree = (
      <Code lang="typescript">
        <i>{LONG}</i>
      </Code>
    );
    expect(render(transformChildren(tree, { hyphenate: {} }))).toBe(
      `<b><i>${hyphenate(LONG)}</i></b>`
    );
  });

  test("a component with a lang prop does not end the run", () => {
    function Code({ children }: { children?: ReactNode; lang?: string }) {
      return <b>{children}</b>;
    }
    const html = render(
      <Hyphenate>
        <p>
          Hraðbrautar<Code lang="typescript">framkvæmdir</Code>
        </p>
      </Hyphenate>
    );
    expect(html.replace(/<\/?b>/g, "")).toBe(`<p>${hyphenate(LONG)}</p>`);
  });

  test("the translate prop of a component is not read, but data-skiptingar=off is", () => {
    function Wrap({ children }: { children?: ReactNode; translate?: string }) {
      return <b>{children}</b>;
    }
    const html = render(
      <Hyphenate>
        <Wrap translate="no">{LONG}</Wrap>
        <Wrap {...{ "data-skiptingar": "off" }}>{LONG}</Wrap>
      </Hyphenate>
    );
    expect(html).toBe(`<b>${hyphenate(LONG)}</b><b>${LONG}</b>`);
  });

  test("English quotes in a lang=en span are not converted", () => {
    const html = render(
      <Typeset>
        <p>
          Hann sagði "<span lang="en">"hello"</span>" og "orð"
        </p>
      </Typeset>
    );
    expect(html).toContain('<span lang="en">&quot;hello&quot;</span>');
    expect(html).toContain("„orð“");
  });

  test("a foreign span ends the run, so quotes do not pair across it", () => {
    const html = render(
      <Typeset>
        <p>
          "a <span lang="en">word</span> b"
        </p>
      </Typeset>
    );
    expect(html).toBe('<p>&quot;a <span lang="en">word</span> b&quot;</p>');
  });

  test("the lang prop of the wrapper: default is, other languages process nothing", () => {
    const off = render(
      <Hyphenate lang="en">
        <p>{LONG}</p>
      </Hyphenate>
    );
    expect(off).toBe(`<p>${LONG}</p>`);
    const inner = render(
      <Hyphenate lang="en">
        <p>{LONG}</p>
        <p lang="is">{LONG}</p>
      </Hyphenate>
    );
    expect(inner).toBe(`<p>${LONG}</p><p lang="is">${hyphenate(LONG)}</p>`);
    const on = render(
      <Hyphenate lang="is-IS">
        <p>{LONG}</p>
      </Hyphenate>
    );
    expect(on).toBe(`<p>${hyphenate(LONG)}</p>`);
    const typeset = render(
      <Typeset lang="en">
        <p>"a"</p>
      </Typeset>
    );
    expect(typeset).toBe("<p>&quot;a&quot;</p>");
  });
});

describe("skipped subtrees and empty lang", () => {
  test("a skipped inline element ends the run", () => {
    const html = render(
      <Typeset>
        <p>
          555<code>x</code> 1234
        </p>
      </Typeset>
    );
    expect(html).toBe("<p>555<code>x</code> 1234</p>");
  });

  test.each([
    ["kbd", <kbd key="k">x</kbd>],
    ["samp", <samp key="s">x</samp>],
    ["var", <var key="v">x</var>],
    [
      "data-skiptingar=off",
      <span data-skiptingar="off" key="o">
        x
      </span>,
    ],
    [
      "translate=no",
      <span key="t" translate="no">
        x
      </span>,
    ],
  ])("%s in the middle ends the run", (_name, element) => {
    const html = render(
      <Typeset>
        <p>555{element} 1234</p>
      </Typeset>
    );
    expect(html).toContain(" 1234");
    expect(html).not.toContain(NB);
  });

  test("quotes still pair across a non-skipped inline element", () => {
    const html = render(
      <Typeset>
        <p>
          "<strong>orð</strong>" og 5 km
        </p>
      </Typeset>
    );
    expect(html).toContain("„<strong>orð</strong>“");
  });

  test("an empty lang means unknown language and is skipped", () => {
    const html = render(
      <Typeset>
        <p>
          <span lang="">"orð" 555-1234</span>
        </p>
      </Typeset>
    );
    expect(html).toBe('<p><span lang="">&quot;orð&quot; 555-1234</span></p>');
    expect(
      render(
        <Hyphenate>
          <p lang=" ">{LONG}</p>
        </Hyphenate>
      )
    ).toBe(`<p lang=" ">${LONG}</p>`);
  });

  test("a nested lang=is inside an empty lang is processed", () => {
    const html = render(
      <Hyphenate>
        <p lang="">
          {LONG} <span lang="is">{LONG}</span>
        </p>
      </Hyphenate>
    );
    expect(html).toBe(`<p lang="">${LONG} <span lang="is">${hyphenate(LONG)}</span></p>`);
  });
});

describe("<Typeset>", () => {
  test("typesets without adding soft hyphens", () => {
    const html = render(
      <Typeset>
        <p>Hann sagði "orð" um {LONG}, 5 km frá</p>
      </Typeset>
    );
    expect(html).not.toContain(SHY);
    expect(html).toContain("„orð“");
    expect(html).toContain(LONG);
  });

  test("skips code like <Hyphenate> does", () => {
    const html = render(
      <Typeset>
        <code>"x"</code>
      </Typeset>
    );
    expect(html).toBe("<code>&quot;x&quot;</code>");
  });
});

describe("Unicode normalisation", () => {
  test("<Hyphenate> on NFD text produces the NFC hyphenated output", () => {
    const nfc = "Þjóðleikhúsið er íþróttafélagið á ástríða";
    const html = render(
      <Hyphenate rules="ritreglur">
        <p>{nfc.normalize("NFD")}</p>
      </Hyphenate>
    );
    expect(html).toBe(`<p>${hyphenate(nfc, { rules: "ritreglur" })}</p>`);
    expect(html).toContain(SHY);
  });

  test("segments split by an inline element are normalised before typeset", () => {
    const html = render(
      <Hyphenate rules="ritreglur">
        <p>
          {'Hann sagði "'.normalize("NFD")}
          <em>{"Þjóðleikhúsið".normalize("NFD")}</em>
          {'" og fór'.normalize("NFD")}
        </p>
      </Hyphenate>
    );
    expect(html).toBe(
      `<p>Hann sagði „<em>${hyphenate("Þjóðleikhúsið", { rules: "ritreglur" })}</em>“ og fór</p>`
    );
  });

  test("<Typeset> normalises to NFC as well", () => {
    const html = render(<Typeset>{"Sjá nr. 5 á ástríða".normalize("NFD")}</Typeset>);
    expect(html).toBe(`Sjá nr.${NB}5 á ástríða`.normalize("NFC"));
  });
});

describe("words split by inline markup", () => {
  /** The html without the <em> and <span> tags. */
  const withoutTags = (html: string) => html.replace(/<\/?(?:em|span)>/g, "");

  test("a split word is hyphenated like the unsplit word, cut at the border", () => {
    const html = render(
      <Hyphenate>
        <p>
          Hraðbrautar<em>framkvæmdir</em>
        </p>
      </Hyphenate>
    );
    expect(withoutTags(html)).toBe(`<p>${hyphenate(LONG)}</p>`);
    // The break on the border goes at the end of the earlier segment.
    expect(html).toContain(`ar${SHY}<em>fram${SHY}`);
  });

  test("a digit in one piece protects the whole token, as in the plain string", () => {
    const html = render(
      <Hyphenate>
        <p>
          12<span>hestarnir</span>
        </p>
      </Hyphenate>
    );
    expect(html).toBe("<p>12<span>hestarnir</span></p>");
    expect(hyphenate("12hestarnir")).toBe("12hestarnir");
  });

  test("a valid break on the border is kept", () => {
    const html = render(
      <Hyphenate rules="ritreglur">
        <p>
          hest<span>arnir</span>
        </p>
      </Hyphenate>
    );
    expect(hyphenate("hestarnir", { rules: "ritreglur" })).toBe(`hest${SHY}arn${SHY}ir`);
    expect(html).toBe(`<p>hest${SHY}<span>arn${SHY}ir</span></p>`);
  });

  test("a domain split by an element is still left alone", () => {
    const html = render(
      <Hyphenate>
        <p>
          <em>orð</em>.is
        </p>
      </Hyphenate>
    );
    expect(html).toBe("<p><em>orð</em>.is</p>");
  });
});

describe("processSegments", () => {
  test("returns one segment for each input and cuts a border break to the earlier one", () => {
    const out = processSegments(["hest", "arnir"], {
      hyphenate: { rules: "ritreglur" },
    });
    expect(out).toEqual([`hest${SHY}`, `arn${SHY}ir`]);
  });

  test("normalises, removes soft hyphens, and uses a custom hyphen character", () => {
    const out = processSegments([`Hrað${SHY}braut`.normalize("NFD"), "ar"], {
      hyphenate: { hyphenChar: "|", rules: "ritreglur" },
    });
    expect(out.join("")).toBe(
      hyphenate("Hraðbrautar", { rules: "ritreglur", hyphenChar: "|" })
    );
    expect(out).toHaveLength(2);
  });

  test("does nothing but normalise when both options are off", () => {
    expect(processSegments(["á".normalize("NFD"), "b"], {})).toEqual(["á", "b"]);
  });

  test("keeps soft hyphens already in the text when only typesetting", () => {
    expect(processSegments([`hest${SHY}arnir`], { typeset: {} })).toEqual([
      `hest${SHY}arnir`,
    ]);
  });

  test("a mark that composes across a border costs only its own word", () => {
    const out = processSegments(["a", "́stríða Hraðbrautarframkvæmdir"], {
      hyphenate: {},
    });
    expect(out).toEqual(["a", `́stríða ${hyphenate("Hraðbrautarframkvæmdir")}`]);
  });
});
