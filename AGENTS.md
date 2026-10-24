# AGENTS.md

Guidance for AI coding agents working in this repository. `README.md` explains how the
site is wired; this file records the rules that are not obvious from the code.

## What this repository is

A VitePress site for the Xahau Hook C/WebAssembly API. All content lives under
`hook-docs/`; the only code is `hook-docs/.vitepress/config.mts`, the plugins next to it,
the custom theme in `hook-docs/.vitepress/theme/`, and the repo-root `middleware.ts`.

## Language and sources of truth

- Everything is written in English: documentation, code, comments, commit messages, and
  pull requests.
- The xahaud source code is the source of truth. When a page disagrees with xahaud, fix
  the page; when a comment in xahaud disagrees with the implementation, follow the
  implementation. Do not write into the docs that a source and the docs disagree.
- Claims carry evidence as HTML comments (`<!-- hook/macro.h:40 -->`) placed next to the
  text they support. Code that only matters to xahaud developers (for example
  `getTransactionalStakeHolders`) is kept as evidence inside such comments, never as
  reader-facing text.
- Do not state how many API functions exist, in total or per group ("the ten control
  APIs"). Every such number becomes stale when an amendment adds a function; describe
  the group instead.
- Every page is also served as raw Markdown (`<page>.md`, or `Accept: text/markdown`)
  with frontmatter and HTML comments stripped, so nothing a reader needs may live only in
  frontmatter or comments.

## Page structure

- `README.md` is the index page of its directory (the config rewrites it to `index.md`).
  The root `README.md` is the home page and carries `layout: home` frontmatter; its body
  still renders below the hero.
- The sidebar is generated from the file tree. A page's label is its first H1 unless the
  frontmatter sets `sidebarTitle`; add one whenever the H1 is long. Ordering comes from
  `SIDEBAR_ORDER` in `config.mts`: register every new page there or it is appended
  alphabetically.
- API reference pages follow one template of bold lead-in paragraphs, in this order:
  **Summary.**, **Signature.**, **Parameters.**, **Return value.**,
  **Common failure patterns.**, **Caveats / notes.**, **Minimal example.**,
  optionally **Practical example.**, then **Related APIs.** Keep that order when adding a
  function page.

## Links

- Use relative paths that include the `.md` extension (`../control/accept.md`,
  `sethook-fields/README.md`). VitePress resolves them and the build fails on dead links.
- Link text must mean something to the reader; never use the path (`overview`,
  `api-reference/control/`, `../../glossary`). Use the target page's title:
  - inside a sentence: the short `sidebarTitle` (`Overview`, `Control APIs`, `HookOn`);
  - a list item that is only a link: the H1 (`Example: Payment Filter`);
  - a link to a section: `Page: Heading` (`Compiling Hooks: Guard validation at install time`);
  - an API function page: the backticked function name (`` `accept` ``);
  - a `macros/*` page: its H1 (`Amount and STO helpers`).
- Section anchors use VitePress's slugifier: lowercase, non-alphanumerics become `-`, and
  an apostrophe is a separator (`Don't ship` becomes `don-t-ship`).

## Tables

- Keep every table cell on one line. Inside tables use the short title of the target page
  (or the API group name such as `Slot APIs` for a function page), not the H1 or the
  `Page: Heading` form. Line breaks inside prose are fine; inside tables they are not.
- Never place an evidence comment between table rows or directly after the last row; it
  breaks the table. Put it inside the cell it supports, or after a blank line below the
  table.

## Evidence comments in lists

- A comment that supports a bullet goes inside that bullet, indented two spaces under it.
  An unindented `<!-- -->` line between two bullets ends the list, and the next bullet
  renders as a separate list.

## Theme

- `hook-docs/.vitepress/theme/custom.css` maps the Xahau Design System (Blue theme)
  tokens onto VitePress's `--vp-*` variables. The token values are vendored because the
  package is not published; do not import the design system's component stylesheet, which
  sets global `body` and `a` rules that fight the default theme.
- Override `--vp-*` variables first. When a component rule is needed, use a descendant
  selector (`.VPHero .VPButton`): VitePress's scoped styles have specificity (0,2,0) and a
  bare class selector loses.

## Tooling and verification

- Package manager is pnpm. Formatting and linting are Biome (space indent, double quotes);
  Markdown under `hook-docs/` is excluded from Biome.
- Before opening a pull request run `pnpm lint`, `pnpm test` (Node's test runner, no
  framework), and `pnpm build`. The build is the dead-link check.
- A `vitepress preview` left running across a rebuild serves stale, unstyled HTML; restart
  it after every build.
- Do not commit screenshots or other binary review material to the repository.
