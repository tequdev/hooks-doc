import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { type DefaultTheme, defineConfig } from "vitepress";
import { rawMarkdownPlugin } from "./plugins/rawMarkdown";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// hook-docs/ (the VitePress project root / srcDir)
const docsRoot = path.resolve(__dirname, "..");

const INDEX_BASENAMES = new Set(["readme", "index"]);
const NAMED_PREFIXES = ["api-reference", "examples"] as const;

/**
 * Sidebar items listed here appear first, in this order, among their siblings.
 * Use the page slug (the path below hook-docs without ".md"); README.md and
 * index.md use their directory slug. Unlisted siblings follow alphabetically.
 */
const SIDEBAR_ORDER = [
  // Guides: concepts first, then implementation, deployment, and lookup material.
  "overview",
  "xfl",
  "best-practices",
  "sethook-fields",
  "macros",
  "tools",
  "glossary",

  // Macros: fundamental calling conventions before specialized and proposed helpers.
  "macros/buffer-helpers",
  "macros/guards",
  "macros/control-flow",
  "macros/tracing",
  "macros/buffer-comparison",
  "macros/integer-conversion",
  "macros/amount-and-sto",
  "macros/report-buffers",
  "macros/constants",
  "macros/patterns",
  "macros/proposed-helpers",

  // Tools: the dedicated Transaction Builder page orders under the tools index.
  "tools/tx-builder",

  // SetHook: operation selection, installation fields, runtime behavior, then permissions.
  "sethook-fields/operations-field-matrix",
  "sethook-fields/flags",
  "sethook-fields/createcode",
  "sethook-fields/hookhash",
  "sethook-fields/hookapiversion",
  "sethook-fields/hooknamespace",
  "sethook-fields/hookparameters",
  "sethook-fields/hookon",
  "sethook-fields/hookon-incoming-outgoing",
  "sethook-fields/hookcanemit",
  "sethook-fields/hookgrants",
  "sethook-fields/hookname",

  // API groups: execution and input first, then state, ledger data, and advanced operations.
  "api-reference",
  "api-reference/control",
  "api-reference/transaction",
  "api-reference/state",
  "api-reference/slot",
  "api-reference/ledger",
  "api-reference/emit",
  "api-reference/float",
  "api-reference/utility",
  "api-reference/sto",
  "api-reference/trace",

  // Control: mandatory guard and outcomes before context and chain-control helpers.
  "api-reference/control/_g",
  "api-reference/control/accept",
  "api-reference/control/rollback",
  "api-reference/control/hook_account",
  "api-reference/control/hook_param",
  "api-reference/control/hook_hash",
  "api-reference/control/hook_pos",
  "api-reference/control/hook_param_set",
  "api-reference/control/hook_again",
  "api-reference/control/hook_skip",

  // Originating transaction: identify and inspect it before slots and emission lineage.
  "api-reference/transaction/otxn_type",
  "api-reference/transaction/otxn_field",
  "api-reference/transaction/otxn_id",
  "api-reference/transaction/otxn_param",
  "api-reference/transaction/otxn_slot",
  "api-reference/transaction/otxn_burden",
  "api-reference/transaction/otxn_generation",

  // State: local operations before grant-dependent foreign access.
  "api-reference/state/state",
  "api-reference/state/state_set",
  "api-reference/state/state_foreign",
  "api-reference/state/state_foreign_set",

  // Slots: load, inspect, traverse, convert, handle special sources, then release.
  "api-reference/slot/slot",
  "api-reference/slot/slot_float",
  "api-reference/slot/slot_set",
  "api-reference/slot/slot_clear",
  "api-reference/slot/slot_subfield",
  "api-reference/slot/slot_subarray",
  "api-reference/slot/slot_count",
  "api-reference/slot/slot_size",
  "api-reference/slot/slot_type",
  "api-reference/slot/meta_slot",
  "api-reference/slot/xpop_slot",

  // Ledger: common context values before nonces and keylet enumeration.
  "api-reference/ledger/fee_base",
  "api-reference/ledger/ledger_last_time",
  "api-reference/ledger/ledger_last_hash",
  "api-reference/ledger/ledger_seq",
  "api-reference/ledger/ledger_nonce",
  "api-reference/ledger/ledger_keylet",

  // Emission: follow the enforced reserve/build/submit lifecycle; gated prepare comes last.
  "api-reference/emit/emit",
  "api-reference/emit/prepare",
  "api-reference/emit/etxn_reserve",
  "api-reference/emit/etxn_details",
  "api-reference/emit/etxn_fee_base",
  "api-reference/emit/etxn_nonce",
  "api-reference/emit/etxn_generation",
  "api-reference/emit/etxn_burden",

  // XFL: construct and inspect, calculate, compare, then convert to and from Amount fields.
  "api-reference/float/float_one",
  "api-reference/float/float_set",
  "api-reference/float/float_sign",
  "api-reference/float/float_mantissa",
  "api-reference/float/float_negate",
  "api-reference/float/float_compare",
  "api-reference/float/float_sum",
  "api-reference/float/float_multiply",
  "api-reference/float/float_mulratio",
  "api-reference/float/float_divide",
  "api-reference/float/float_invert",
  "api-reference/float/float_root",
  "api-reference/float/float_log",
  "api-reference/float/float_int",
  "api-reference/float/float_sto",
  "api-reference/float/float_sto_set",

  // Utilities: ledger addressing, account conversion, hashing, and signature verification.
  "api-reference/utility/util_accid",
  "api-reference/utility/util_raddr",
  "api-reference/utility/util_keylet",
  "api-reference/utility/util_sha512h",
  "api-reference/utility/util_verify",

  // STO: validate before reading, then mutate.
  "api-reference/sto/sto_validate",
  "api-reference/sto/sto_subfield",
  "api-reference/sto/sto_subarray",
  "api-reference/sto/sto_emplace",
  "api-reference/sto/sto_erase",

  // Tracing: generic buffers and integers before XFL-specific output.
  "api-reference/trace/trace",
  "api-reference/trace/trace_num",
  "api-reference/trace/trace_float",

  // Examples: stateless filtering through progressively more consequential state changes.
  "examples",
  "examples/payment-filter",
  "examples/state-counter",
  "examples/memo-routing",
  "examples/foreign-state",
  "examples/emitted-transaction",
] as const;

const sidebarOrderBySlug = new Map<string, number>(
  SIDEBAR_ORDER.map((slug, index) => [slug, index]),
);

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

function sidebarTitleOf(filePath: string): string {
  const text = fs.readFileSync(filePath, "utf8");
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  const sidebarTitle = frontmatter?.match(/^sidebarTitle:\s*(.+?)\s*$/m)?.[1];
  if (sidebarTitle) {
    return sidebarTitle.replace(/^(['"])(.*)\1$/, "$2").trim();
  }
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
      return { slug: slugOf(relPath), title: sidebarTitleOf(filePath) };
    })
    .sort((a, b) => {
      const aOrder = sidebarOrderBySlug.get(a.slug);
      const bOrder = sidebarOrderBySlug.get(b.slug);
      if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
      if (aOrder !== undefined) return -1;
      if (bOrder !== undefined) return 1;
      return a.slug.localeCompare(b.slug);
    });
}

/** Build an index/children tree: a doc is a child of another doc whose slug
 * equals its own parent directory (e.g. "api-reference/control/accept" is a
 * child of the index page "api-reference/control"). Mirrors a directory's
 * README.md acting as its index. */
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
    item.items = children.map((child) => toSidebarItem(child, childrenBySlug));
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
    plugins: [rawMarkdownPlugin(docsRoot)],
  },

  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Overview", link: "/overview" },
      { text: "API Reference", link: "/api-reference/" },
      { text: "Examples", link: "/examples/" },
      { text: "Tools", link: "/tools/" },
    ],
    sidebar: buildSidebar(),
    search: { provider: "local" },
  },
});
