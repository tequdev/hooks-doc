/** biome-ignore-all lint/correctness/noVoidTypeReturn: we need to return void to satisfy the type */
import * as fs from "node:fs";
import * as path from "node:path";
import type { Plugin } from "vitepress";

interface MiddlewareRequest {
  headers?: Record<string, string | string[] | undefined>;
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

interface RawMarkdownOptions {
  /** Page slugs (clean path without leading "/" and without ".md") in sidebar order; root is "". */
  pageOrder: string[];
}

const INDEX_BASENAMES = new Set(["readme", "index"]);
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function collectMarkdownFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(collectMarkdownFiles(full));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function isWithinDocsRoot(docsRoot: string, filePath: string): boolean {
  const relative = path.relative(docsRoot, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function stripMarkdownFrontmatter(text: string): string {
  return text.replace(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/, "");
}

/**
 * Maps a source file's docsRoot-relative posix path to its clean-URL Markdown
 * output path. A README.md/index.md collapses onto its parent directory
 * (the root index becomes "/index.md").
 */
export function cleanPathOf(relPath: string): string {
  const parts = relPath.replace(/\.md$/i, "").split("/");
  const base = parts[parts.length - 1];
  if (base !== undefined && INDEX_BASENAMES.has(base.toLowerCase())) parts.pop();
  const dir = parts.join("/");
  return dir === "" ? "/index.md" : `/${dir}.md`;
}

/** Splits a link target into its path portion and its "#fragment"/"?query" suffix. */
function splitTargetSuffix(target: string): { targetPath: string; suffix: string } {
  const match = target.match(/^([^#?]*)([#?].*)?$/);
  return { targetPath: match?.[1] ?? target, suffix: match?.[2] ?? "" };
}

function resolveLinkTarget(
  target: string,
  relPath: string,
  hasPage: (cleanPath: string) => boolean,
): string {
  if (
    target === "" ||
    target.startsWith("#") ||
    target.startsWith("?") ||
    target.startsWith("//")
  ) {
    return target;
  }
  if (URL_SCHEME.test(target)) return target;

  const { targetPath, suffix } = splitTargetSuffix(target);

  let resolved: string;
  if (targetPath.startsWith("/")) {
    resolved = targetPath.slice(1);
  } else {
    resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relPath), targetPath));
    if (resolved === ".." || resolved.startsWith("../")) return target;
  }
  // "." / "./" is the normalized form of a link back to the docs root itself.
  if (resolved === "." || resolved === "./") resolved = "";

  if (/\.md$/i.test(resolved)) return cleanPathOf(resolved) + suffix;

  if (resolved === "" || resolved.endsWith("/")) {
    const dir = resolved.replace(/\/$/, "");
    const candidate = dir === "" ? "/index.md" : `/${dir}.md`;
    return hasPage(candidate) ? `${candidate}${suffix}` : target;
  }

  const lastSegment = resolved.slice(resolved.lastIndexOf("/") + 1);
  if (!lastSegment.includes(".")) {
    const candidate = `/${resolved}.md`;
    return hasPage(candidate) ? `${candidate}${suffix}` : target;
  }

  // An asset link (last segment has a non-".md" extension), relative or
  // already root-absolute: leave it exactly as written.
  return target;
}

function rewriteLineLinks(
  line: string,
  relPath: string,
  hasPage: (cleanPath: string) => boolean,
): string {
  // "[^1]: ..." is a footnote definition, not a reference-style link
  // definition; leave the whole line to the inline-link pass below so any
  // link inside the footnote's own text still gets rewritten.
  const refMatch = line.match(/^(\s*\[(?!\^)[^\]]+\]:\s*)(\S+)(.*)$/);
  if (refMatch) {
    const [, prefix, target, rest] = refMatch;
    return `${prefix}${resolveLinkTarget(target ?? "", relPath, hasPage)}${rest}`;
  }
  return line.replace(/\]\(([^)]*)\)/g, (_match, target: string) => {
    return `](${resolveLinkTarget(target, relPath, hasPage)})`;
  });
}

interface FenceRun {
  char: string;
  len: number;
}

/** The opening run of a fence delimiter line (3+ backticks or tildes), if any. */
function matchFence(line: string): FenceRun | undefined {
  const match = line.match(/^\s*(`{3,}|~{3,})/);
  const run = match?.[1];
  return run === undefined ? undefined : { char: run[0] as string, len: run.length };
}

function rewriteLinks(
  text: string,
  relPath: string,
  hasPage: (cleanPath: string) => boolean,
): string {
  let fence: FenceRun | undefined;
  return text
    .split("\n")
    .map((line) => {
      const run = matchFence(line);
      if (fence) {
        // Only a run of the same character, at least as long as the one that
        // opened it, closes the fence — a shorter or differently-fenced
        // block nested inside (e.g. ``` inside a ```` block) does not.
        if (run && run.char === fence.char && run.len >= fence.len) fence = undefined;
        return line;
      }
      if (run) {
        fence = run;
        return line;
      }
      return rewriteLineLinks(line, relPath, hasPage);
    })
    .join("\n");
}

const WHITESPACE_ONLY = /^[ \t]*$/;

/**
 * Removes HTML comments while keeping surrounding text and avoiding stray
 * whitespace: a comment alone on its line (with anything spanned inside it)
 * takes the whole line with it; a comment at the start of a line followed by
 * text drops the space(s) after it so the following text starts at column 0;
 * any other inline comment eats the whitespace immediately before it.
 *
 * Each `<!-- ... -->` match is resolved independently by looking only at its
 * own line, rather than folding the "is this line blank around it" check
 * into the removal regex itself: a combined pattern's trailing
 * whitespace-then-newline requirement can fail against the nearest `-->`
 * (because real text follows it), forcing the lazy quantifier to backtrack
 * past it and swallow everything up to the next comment's closing tag.
 */
function stripMarkdownComments(text: string): string {
  const commentRe = /<!--[\s\S]*?-->/g;
  let result = "";
  let cursor = 0;
  let match: RegExpExecArray | null = commentRe.exec(text);
  while (match !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const nextNewline = text.indexOf("\n", end);
    const lineEnd = nextNewline === -1 ? text.length : nextNewline;

    const beforeIsBlank = WHITESPACE_ONLY.test(text.slice(lineStart, start));
    const afterIsBlank = WHITESPACE_ONLY.test(text.slice(end, lineEnd));

    if (beforeIsBlank && afterIsBlank) {
      // The comment is alone on its line(s): drop the whole line, including its newline.
      result += text.slice(cursor, lineStart);
      cursor = lineEnd < text.length ? lineEnd + 1 : lineEnd;
    } else if (beforeIsBlank) {
      // Line-start comment followed by text: drop the space(s) after it too.
      result += text.slice(cursor, start);
      let after = end;
      while (after < text.length && (text[after] === " " || text[after] === "\t")) after++;
      cursor = after;
    } else {
      // Inline comment: eat the whitespace immediately before it instead.
      let before = start;
      while (before > lineStart && (text[before - 1] === " " || text[before - 1] === "\t"))
        before--;
      result += text.slice(cursor, before);
      cursor = end;
    }

    match = commentRe.exec(text);
  }
  result += text.slice(cursor);
  return result;
}

/**
 * Produces the clean, agent-friendly Markdown document for one source file:
 * comments and frontmatter stripped, links rewritten to root-absolute clean
 * URLs, and a `url:` frontmatter block naming the page's own clean path.
 */
export function transformMarkdown(
  source: string,
  relPath: string,
  hasPage: (cleanPath: string) => boolean,
): string {
  let text = source.replace(/\r\n?/g, "\n");
  text = stripMarkdownComments(text);
  text = stripMarkdownFrontmatter(text);
  text = rewriteLinks(text, relPath, hasPage);
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return `---\nurl: ${cleanPathOf(relPath)}\n---\n\n${text}\n`;
}

/**
 * For the dev-server middleware: the ".md" path a request is asking for, if
 * any. A ".md" URL names the document directly; a clean page URL is served as
 * Markdown only when the client sends `Accept: text/markdown`.
 */
export function requestedMarkdownPath(
  pathname: string,
  accept: string | undefined,
): string | undefined {
  if (pathname.endsWith(".md")) return pathname;
  if (accept?.includes("text/markdown")) {
    const page = pathname.replace(/\/$/, "");
    return `${page || "/index"}.md`;
  }
  return undefined;
}

interface CleanPathEntry {
  absPath: string;
  relPath: string;
}

function buildCleanPathMap(docsRoot: string): Map<string, CleanPathEntry> {
  const map = new Map<string, CleanPathEntry>();
  for (const absPath of collectMarkdownFiles(docsRoot)) {
    const relPath = toPosixPath(path.relative(docsRoot, absPath));
    map.set(cleanPathOf(relPath), { absPath, relPath });
  }
  return map;
}

function makeHasPage(map: Map<string, CleanPathEntry>): (cleanPath: string) => boolean {
  return (cleanPath: string) => map.has(cleanPath);
}

function handleRawMarkdownRequest(
  docsRoot: string,
  req: MiddlewareRequest,
  res: MiddlewareResponse,
  next: () => void,
): void {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (!req.url) return next();

  const url = new URL(req.url, "http://localhost");
  // VitePress loads pages by importing their `.md` URLs as JavaScript
  // modules. Let Vite handle those requests; this middleware is only for
  // clients requesting the Markdown document itself.
  if (url.searchParams.has("import") || req.headers?.["sec-fetch-dest"] === "script") {
    return next();
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return next();
  }

  const acceptHeader = req.headers?.accept;
  const accept = Array.isArray(acceptHeader) ? acceptHeader[0] : acceptHeader;
  const requested = requestedMarkdownPath(pathname, accept);
  if (!requested) return next();

  const map = buildCleanPathMap(docsRoot);
  const entry = map.get(requested);
  if (!entry || !isWithinDocsRoot(docsRoot, entry.absPath)) return next();

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(
    transformMarkdown(fs.readFileSync(entry.absPath, "utf8"), entry.relPath, makeHasPage(map)),
  );
}

function slugOfCleanPath(cleanPath: string): string {
  const slug = cleanPath.slice(1, -".md".length);
  return slug === "index" ? "" : slug;
}

export function rawMarkdownPlugin(docsRoot: string, options: RawMarkdownOptions): Plugin {
  return {
    name: "hooks-docs-raw-markdown",
    configureServer(server: MiddlewareServer) {
      server.middlewares.use((req, res, next) =>
        handleRawMarkdownRequest(docsRoot, req, res, next),
      );
    },
    // `vitepress preview` serves the built `dist/` with its own static file
    // server and never calls Vite's `configurePreviewServer` hook, so there
    // is nothing for this plugin to do there — the build's own emitted
    // `<page>.md` files (see generateBundle below) already serve `pnpm preview`.
    generateBundle() {
      const map = buildCleanPathMap(docsRoot);
      const hasPage = makeHasPage(map);
      const docsBySlug = new Map<string, string>();

      for (const entry of map.values()) {
        const transformed = transformMarkdown(
          fs.readFileSync(entry.absPath, "utf8"),
          entry.relPath,
          hasPage,
        );
        const cleanPath = cleanPathOf(entry.relPath);
        this.emitFile({ type: "asset", fileName: cleanPath.slice(1), source: transformed });
        docsBySlug.set(slugOfCleanPath(cleanPath), transformed);
      }

      const seen = new Set<string>();
      const ordered: string[] = [];
      for (const slug of options.pageOrder) {
        const doc = docsBySlug.get(slug);
        if (doc !== undefined) {
          ordered.push(doc);
          seen.add(slug);
        }
      }
      const remaining = [...docsBySlug.keys()].filter((slug) => !seen.has(slug)).sort();
      for (const slug of remaining) {
        const doc = docsBySlug.get(slug);
        if (doc !== undefined) ordered.push(doc);
      }

      this.emitFile({ type: "asset", fileName: "llms-full.txt", source: ordered.join("\n") });
    },
  };
}
