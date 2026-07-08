# Xahau Hooks Docs

A [VitePress](https://vitepress.dev/) documentation site for the Xahau Hook API. The content
lives entirely in [`hook-docs/`](hook-docs/) and is never touched by any build tooling; the
site is just VitePress's default theme pointed at that directory.

## Requirements

- Node.js (tested on Node 22)
- [pnpm](https://pnpm.io/) (see `devEngines` in `package.json`)

## Getting started

```sh
pnpm install
pnpm dev          # start the VitePress dev server, http://localhost:5173
```

Other scripts:

```sh
pnpm build        # build the static site into hook-docs/.vitepress/dist
pnpm preview      # preview the production build locally
pnpm typecheck     # tsc --noEmit (checks hook-docs/.vitepress/config.mts)
pnpm lint          # biome check .
pnpm format        # biome format --write .
```

## How it's wired up

- `hook-docs/.vitepress/config.mts` is the only code in this project. `srcDir` is `.`, so
  every `.md` file under `hook-docs/` becomes a page, exactly mirroring the file tree — no
  markdown file is renamed, moved, or edited to support the site.
- Each directory's `README.md` acts as that directory's index page. Since VitePress only
  treats `index.md` as a directory index by default, a `rewrites()` function remaps every
  `.../README.md` to `.../index.md` at the routing layer, without touching the source files.
- The sidebar is generated at config-load time by walking `hook-docs/` and grouping each
  `README.md` with the sibling pages in its directory (e.g. `api-reference/control/README.md`
  becomes the parent entry for `api-reference/control/accept.md`, `.../rollback.md`, etc.).
  Top-level pages fall under "Guides" unless they're under `api-reference/` or `examples/`.
- Theming is the VitePress default theme, unmodified — no custom CSS or theme overrides.
  Local full-text search (`themeConfig.search.provider: "local"`) and Shiki C/TypeScript
  syntax highlighting come from VitePress out of the box.
- `api-reference/` and `examples/` bare-directory links in `README.md` / `best-practices.md`
  (e.g. `[examples/](examples/)`) don't resolve to a page, since neither directory has its own
  top-level `README.md`; they're allow-listed via `ignoreDeadLinks` in the config rather than
  worked around by adding new markdown files.

## Adding new docs

Drop a new `.md` file anywhere under `hook-docs/`; it's picked up automatically the next time
the dev server or build runs. Add a `README.md` to a new directory to give it an index page
and have its siblings grouped under it in the sidebar automatically.
