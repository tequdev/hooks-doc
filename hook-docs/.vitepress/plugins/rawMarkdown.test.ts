import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanPathOf, requestedMarkdownPath, transformMarkdown } from "./rawMarkdown.ts";

test("cleanPathOf collapses README/index onto their parent directory", () => {
  assert.equal(cleanPathOf("api-reference/ledger/README.md"), "/api-reference/ledger.md");
  assert.equal(cleanPathOf("README.md"), "/index.md");
  assert.equal(cleanPathOf("overview.md"), "/overview.md");
  assert.equal(cleanPathOf("api-reference/index.md"), "/api-reference.md");
});

const FIXTURE = `---
sidebarTitle: "Ledger APIs"
---

# Ledger APIs

- [a](fee_base.md)
- [b](../slot/README.md)
- [c](../../glossary.md#burden)
- [d](../../README.md)
- [e](https://example.com/x.md)
- [f](#local)
- [g](../control/)

\`\`\`
[x](y.md)
\`\`\`

<!-- evidence --> \`hook/error.h\`.
`;

test("transformMarkdown strips comments/frontmatter, rewrites relative links, and prepends url frontmatter", () => {
  const hasPage = (p: string) => p === "/api-reference/control.md";
  const out = transformMarkdown(FIXTURE, "api-reference/ledger/README.md", hasPage);

  assert.ok(out.startsWith("---\nurl: /api-reference/ledger.md\n---\n\n"));
  assert.ok(out.includes("[a](/api-reference/ledger/fee_base.md)"));
  assert.ok(out.includes("[b](/api-reference/slot.md)"));
  assert.ok(out.includes("[c](/glossary.md#burden)"));
  assert.ok(out.includes("[d](/index.md)"));
  assert.ok(out.includes("[e](https://example.com/x.md)"));
  assert.ok(out.includes("[f](#local)"));
  assert.ok(out.includes("[g](/api-reference/control.md)"));

  // fenced code block content is left untouched
  assert.ok(out.includes("```\n[x](y.md)\n```"));

  // the text after an evidence comment survives, and no comment remains
  assert.ok(out.includes("`hook/error.h`."));
  assert.ok(!out.includes("<!--"));
  assert.ok(!out.includes("sidebarTitle"));
});

test("transformMarkdown rewrites root-absolute in-site links, appending .md only for known pages", () => {
  const pages = new Set(["/overview.md", "/tools/tx-builder.md", "/tools.md"]);
  const hasPage = (p: string) => pages.has(p);
  const source = `# Page

- [a](/overview)
- [b](/tools/tx-builder#x)
- [c](/tools/)
- [d](/nope)
- [e](/assets/x.png)
`;
  const out = transformMarkdown(source, "guide/page.md", hasPage);

  assert.ok(out.includes("[a](/overview.md)"));
  assert.ok(out.includes("[b](/tools/tx-builder.md#x)"));
  assert.ok(out.includes("[c](/tools.md)"));
  assert.ok(out.includes("[d](/nope)"));
  assert.ok(out.includes("[e](/assets/x.png)"));
});

test("transformMarkdown strips comments without leaving stray whitespace or blank lines", () => {
  const hasPage = () => false;

  const standalone = transformMarkdown(
    "Paragraph one.\n\n<!-- standalone comment -->\n\nParagraph two.\n",
    "guide/page.md",
    hasPage,
  );
  assert.ok(standalone.includes("Paragraph one.\n\nParagraph two."));
  assert.ok(!standalone.includes("\n\n\n"));

  const lineStart = transformMarkdown(
    "Some text.\n\n<!-- evidence --> `hook/error.h`.\n",
    "guide/page.md",
    hasPage,
  );
  assert.ok(lineStart.split("\n").includes("`hook/error.h`."));

  const inline = transformMarkdown(
    "See docs from <!-- inline note --> `hook/error.h` for details.\n",
    "guide/page.md",
    hasPage,
  );
  assert.ok(inline.includes("from `hook/error.h` for"));

  const tableCell = transformMarkdown(
    "| Field | text<!-- cell note --> |\n",
    "guide/page.md",
    hasPage,
  );
  assert.ok(tableCell.includes("| Field | text |"));
});

// (a) asset links (last segment has a non-".md" extension) are left exactly as written,
// whether relative or already root-absolute.
test("transformMarkdown leaves relative and absolute asset links unchanged", () => {
  const hasPage = () => true; // even if a page happened to exist at that path, assets are skipped
  const out = transformMarkdown(
    "- [logo](../assets/logo.png)\n- [icon](/assets/icon.svg)\n",
    "guide/page.md",
    hasPage,
  );
  assert.ok(out.includes("[logo](../assets/logo.png)"));
  assert.ok(out.includes("[icon](/assets/icon.svg)"));
});

// (b) a relative link that resolves to the docs root itself ("." / "./") is treated as "".
test("transformMarkdown resolves a relative link back to the docs root as /index.md", () => {
  const hasPage = (p: string) => p === "/index.md";
  const out = transformMarkdown("[home](../)\n", "a/b.md", hasPage);
  assert.ok(out.includes("[home](/index.md)"));
});

// (c) a query-only target (no path) is left unchanged.
test("transformMarkdown leaves a query-only link target unchanged", () => {
  const out = transformMarkdown("[sorted](?sort=asc)\n", "guide/page.md", () => true);
  assert.ok(out.includes("[sorted](?sort=asc)"));
});

// (d) footnote definitions ("[^1]: ...") are not treated as reference-link definitions,
// so a link inside the footnote's own text still gets rewritten normally; an ordinary
// reference-style definition on another line is still rewritten as before.
test("transformMarkdown does not treat footnote definitions as reference-link definitions", () => {
  const hasPage = () => false;
  const source = [
    "See the note.[^1]",
    "",
    "[^1]: Not a reference link, but see [related](other.md) for details.",
    "",
    "[ref]: page.md",
    "",
  ].join("\n");
  const out = transformMarkdown(source, "guide/page.md", hasPage);
  assert.ok(out.includes("[^1]: Not a reference link, but see [related](/guide/other.md) for"));
  assert.ok(out.includes("[ref]: /guide/page.md"));
});

// (e) a fence's own delimiter character and length gate what closes it: a shorter/differently
// fenced block nested inside (```` containing ```) must not toggle the outer fence early.
test("transformMarkdown does not let a nested shorter fence close an outer longer one", () => {
  const backtick4 = "`".repeat(4);
  const backtick3 = "`".repeat(3);
  const source = [
    `${backtick4}md`,
    backtick3,
    "[x](y.md)",
    backtick3,
    backtick4,
    "",
    "[real](real.md)",
    "",
  ].join("\n");
  const out = transformMarkdown(source, "guide/page.md", () => false);
  assert.ok(out.includes("[x](y.md)")); // untouched: still inside the outer fence
  assert.ok(out.includes("[real](/guide/real.md)")); // rewritten: outside any fence
});

// (f) CRLF/CR line endings are normalized before any other processing.
test("transformMarkdown normalizes CRLF and CR line endings", () => {
  const out = transformMarkdown("Line one.\r\nLine two.\r\n", "guide/page.md", () => false);
  assert.ok(!out.includes("\r"));
  assert.ok(out.includes("Line one.\nLine two."));
});

test("requestedMarkdownPath", () => {
  assert.equal(requestedMarkdownPath("/overview.md", undefined), "/overview.md");
  assert.equal(requestedMarkdownPath("/overview", "text/markdown"), "/overview.md");
  assert.equal(requestedMarkdownPath("/tools/", "text/html, text/markdown;q=0.9"), "/tools.md");
  assert.equal(requestedMarkdownPath("/", "text/markdown"), "/index.md");
  assert.equal(requestedMarkdownPath("/overview", "text/html"), undefined);
});
