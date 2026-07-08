import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type DefaultTheme, defineConfig } from "vitepress";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// hook-docs/ (the VitePress project root / srcDir)
const docsRoot = path.resolve(__dirname, "..");

const INDEX_BASENAMES = new Set(["readme", "index"]);
const NAMED_PREFIXES = ["api-reference", "examples"] as const;

interface DocMeta {
  /** path relative to docsRoot, using "/" separators, extension stripped, README/index collapsed */
  slug: string;
  title: string;
}

function collectMarkdownFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue; // skip .vitepress, dotfiles
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(collectMarkdownFiles(full));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

function slugOf(relPath: string): string {
  const withoutExt = relPath.replace(/\.md$/i, "");
  const parts = withoutExt.split(path.sep);
  const base = parts[parts.length - 1];
  if (base !== undefined && INDEX_BASENAMES.has(base.toLowerCase())) {
    parts.pop();
  }
  return parts.join("/");
}

function titleOf(filePath: string): string {
  const text = fs.readFileSync(filePath, "utf8");
  const match = text.match(/^#\s+(.+)$/m);
  if (match?.[1]) {
    return match[1].replace(/`/g, "").trim();
  }
  return path.basename(filePath, ".md");
}

function stripMarkdownComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function isWithinDocsRoot(filePath: string): boolean {
  const relative = path.relative(docsRoot, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

interface MiddlewareRequest {
  method?: string;
  url?: string;
}

interface MiddlewareResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

interface MiddlewareServer {
  middlewares: {
    use(handler: (req: MiddlewareRequest, res: MiddlewareResponse, next: () => void) => void): void;
  };
}

function handleRawMarkdownRequest(
  req: MiddlewareRequest,
  res: MiddlewareResponse,
  next: () => void,
): void {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (!req.url) return next();

  const url = new URL(req.url, "http://localhost");
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return next();
  }

  if (!pathname.endsWith(".md")) return next();

  const filePath = path.resolve(docsRoot, `.${pathname}`);
  if (!isWithinDocsRoot(filePath) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return next();
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(stripMarkdownComments(fs.readFileSync(filePath, "utf8")));
}

function rawMarkdownPlugin(): any {
  return {
    name: "hooks-docs-raw-markdown",
    configureServer(server: MiddlewareServer) {
      server.middlewares.use(handleRawMarkdownRequest);
    },
    configurePreviewServer(server: MiddlewareServer) {
      server.middlewares.use(handleRawMarkdownRequest);
    },
    generateBundle() {
      for (const filePath of collectMarkdownFiles(docsRoot)) {
        const relPath = toPosixPath(path.relative(docsRoot, filePath));
        this.emitFile({
          type: "asset",
          fileName: relPath,
          source: stripMarkdownComments(fs.readFileSync(filePath, "utf8")),
        });
      }
    },
  };
}

function loadDocs(): DocMeta[] {
  return collectMarkdownFiles(docsRoot)
    .map((filePath) => {
      const relPath = path.relative(docsRoot, filePath);
      return { slug: slugOf(relPath), title: titleOf(filePath) };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Build a one-level index/children tree: a doc is a child of another doc whose
 * slug equals its own parent directory (e.g. "control/accept" is a child of
 * the index page "control"). Mirrors a directory's README.md acting as its index. */
function buildTree(docs: DocMeta[]) {
  const slugSet = new Set(docs.map((d) => d.slug));
  const childrenBySlug = new Map<string, DocMeta[]>();
  const topLevel: DocMeta[] = [];
  for (const doc of docs) {
    const idx = doc.slug.lastIndexOf("/");
    const parentSlug = idx === -1 ? "" : doc.slug.slice(0, idx);
    if (parentSlug !== "" && slugSet.has(parentSlug)) {
      const siblings = childrenBySlug.get(parentSlug) ?? [];
      siblings.push(doc);
      childrenBySlug.set(parentSlug, siblings);
    } else {
      topLevel.push(doc);
    }
  }
  return { topLevel, childrenBySlug };
}

function toSidebarItem(
  doc: DocMeta,
  childrenBySlug: Map<string, DocMeta[]>,
): DefaultTheme.SidebarItem {
  const children = childrenBySlug.get(doc.slug);
  const item: DefaultTheme.SidebarItem = { text: doc.title, link: `/${doc.slug}` };
  if (children && children.length > 0) {
    item.collapsed = false;
    item.items = children.map((child) => ({ text: child.title, link: `/${child.slug}` }));
  }
  return item;
}

function prefixOf(slug: string): (typeof NAMED_PREFIXES)[number] | "guides" {
  for (const prefix of NAMED_PREFIXES) {
    if (slug === prefix || slug.startsWith(`${prefix}/`)) return prefix;
  }
  return "guides";
}

function buildSidebar(): DefaultTheme.Sidebar {
  const docs = loadDocs();
  const { topLevel, childrenBySlug } = buildTree(docs);

  const buckets: Record<(typeof NAMED_PREFIXES)[number] | "guides", DocMeta[]> = {
    "api-reference": [],
    examples: [],
    guides: [],
  };
  for (const doc of topLevel) {
    if (doc.slug === "") continue; // the site homepage; not listed in its own sidebar
    buckets[prefixOf(doc.slug)].push(doc);
  }

  return {
    "/api-reference/": buckets["api-reference"].map((doc) => toSidebarItem(doc, childrenBySlug)),
    "/examples/": buckets.examples.map((doc) => toSidebarItem(doc, childrenBySlug)),
    "/": buckets.guides.map((doc) => toSidebarItem(doc, childrenBySlug)),
  };
}

export default defineConfig({
  title: "Xahau Hooks Docs",
  description: "Reference documentation for Xahau Hook smart contracts.",
  srcDir: ".",
  cleanUrls: true,

  // README.md and best-practices.md link to the bare "api-reference/" and
  // "examples/" directories (no index page exists there, unlike the
  // per-group READMEs) — not real dead links, just directory references.
  ignoreDeadLinks: [/^\.\/(api-reference|examples)\/index$/],

  // hook-docs/**/README.md files act as the index page of their directory,
  // same as index.md would, without renaming any source file.
  rewrites(id) {
    if (id === "README.md") return "index.md";
    if (id.endsWith("/README.md")) return `${id.slice(0, -"README.md".length)}index.md`;
    return id;
  },

  vite: {
    plugins: [rawMarkdownPlugin()],
  },

  themeConfig: {
    nav: [
      { text: "Overview", link: "/overview" },
      { text: "API Reference", link: "/api-reference/control/" },
      { text: "Examples", link: "/examples/payment-filter" },
    ],
    sidebar: buildSidebar(),
    search: { provider: "local" },
  },
});
