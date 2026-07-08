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

  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Overview", link: "/overview" },
      { text: "API Reference", link: "/api-reference/" },
      { text: "Examples", link: "/examples/" },
    ],
    sidebar: buildSidebar(),
    search: { provider: "local" },
  },
});
