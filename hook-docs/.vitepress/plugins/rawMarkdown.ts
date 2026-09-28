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

const INDEX_BASENAMES = new Set(["readme", "index"]);
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Recursively lists every ".md" file under `dir` (absolute paths), skipping dotfiles/dirs. */
export function collectMarkdownFiles(dir: string): string[] {
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

function stripMarkdownFrontmatter(text: string): string {
  return text.replace(/^---\n([\s\S]*?)\n---(?:\n|$)/, "");
}

/**
 * A source file's docsRoot-relative posix path, collapsed onto its page
 * slug: a README.md/index.md collapses onto its parent directory, and the
 * root index's slug is "".
 */
export function pageSlugOf(relPosixPath: string): string {
  const parts = relPosixPath.replace(/\.md$/i, "").split("/");
  const base = parts[parts.length - 1];
  if (base !== undefined && INDEX_BASENAMES.has(base.toLowerCase())) parts.pop();
  return parts.join("/");
}

/** A source file's docsRoot-relative posix path to its clean-URL Markdown output path. */
export function cleanPathOf(relPath: string): string {
  const slug = pageSlugOf(relPath);
  return slug === "" ? "/index.md" : `/${slug}.md`;
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

function rewriteLinks(
  text: string,
  relPath: string,
  hasPage: (cleanPath: string) => boolean,
): string {
  // `fence` holds the delimiter run (e.g. "````") that opened the current
  // fenced block, if any. Only a run of the same character, at least as long
  // as that one, closes it — a shorter or differently-fenced block nested
  // inside (e.g. ``` inside a ```` block) does not.
  let fence: string | undefined;
  return text
    .split("\n")
    .map((line) => {
      const run = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
      if (fence) {
        if (run !== undefined && run[0] === fence[0] && run.length >= fence.length) {
          fence = undefined;
        }
        return line;
      }
      if (run !== undefined) {
        fence = run;
        return line;
      }
      return rewriteLineLinks(line, relPath, hasPage);
    })
    .join("\n");
}

const WHITESPACE_ONLY = /^[ \t]*$/;

/**
 * Removes HTML comments while keeping surrounding text: a comment alone on
 * its line takes the whole line with it, a line-start comment followed by
 * text drops the space(s) after it, and any other inline comment eats the
 * whitespace immediately before it. Each comment is decided by looking only
 * at its own line; a single regex with a trailing-newline constraint
 * backtracks past the nearest `-->` and swallows text up to the next comment.
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
    const relPath = path.relative(docsRoot, absPath).split(path.sep).join("/");
    map.set(cleanPathOf(relPath), { absPath, relPath });
  }
  return map;
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

  // Node joins duplicate headers of the same name into one comma-separated string.
  const accept = String(req.headers?.accept ?? "");
  const requested = requestedMarkdownPath(pathname, accept);
  if (!requested) return next();

  const map = buildCleanPathMap(docsRoot);
  const entry = map.get(requested);
  if (!entry) return next();

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(
    transformMarkdown(fs.readFileSync(entry.absPath, "utf8"), entry.relPath, (p) => map.has(p)),
  );
}

export function rawMarkdownPlugin(
  docsRoot: string,
  // `pageOrder`: page slugs (as `pageSlugOf` returns them) in sidebar order; root is "".
  options: { pageOrder: string[] },
): Plugin {
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
      const hasPage = (p: string) => map.has(p);
      const docsBySlug = new Map<string, string>();

      for (const entry of map.values()) {
        const transformed = transformMarkdown(
          fs.readFileSync(entry.absPath, "utf8"),
          entry.relPath,
          hasPage,
        );
        this.emitFile({
          type: "asset",
          fileName: cleanPathOf(entry.relPath).slice(1),
          source: transformed,
        });
        docsBySlug.set(pageSlugOf(entry.relPath), transformed);
      }

      // `pageOrder` comes from the same directory walk, so it already covers every page.
      const ordered = options.pageOrder.flatMap((slug) => {
        const doc = docsBySlug.get(slug);
        return doc === undefined ? [] : [doc];
      });

      this.emitFile({ type: "asset", fileName: "llms-full.txt", source: ordered.join("\n") });
    },
  };
}
