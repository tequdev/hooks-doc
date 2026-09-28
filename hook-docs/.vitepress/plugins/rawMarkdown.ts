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

function stripMarkdownComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

function stripMarkdownFrontmatter(text: string): string {
  return text.replace(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/g, "");
}

function stripMarkdown(text: string): string {
  let stripped = stripMarkdownComments(text);
  stripped = stripMarkdownFrontmatter(stripped);
  return stripped;
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function isWithinDocsRoot(docsRoot: string, filePath: string): boolean {
  const relative = path.relative(docsRoot, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
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

  // A `.md` path names the document itself. A clean page URL is served as
  // Markdown only when the client asks for it with `Accept: text/markdown`,
  // mirroring middleware.ts on Vercel; the page may be a file or a directory
  // index (index.md or README.md).
  let candidates: string[];
  if (pathname.endsWith(".md")) {
    candidates = [pathname];
  } else if (String(req.headers?.accept ?? "").includes("text/markdown")) {
    const page = pathname.replace(/\/$/, "");
    candidates = [`${page}.md`, `${page}/index.md`, `${page}/README.md`];
  } else {
    return next();
  }

  const filePath = candidates
    .map((candidate) => path.resolve(docsRoot, `.${candidate}`))
    .find(
      (candidate) =>
        isWithinDocsRoot(docsRoot, candidate) &&
        fs.existsSync(candidate) &&
        fs.statSync(candidate).isFile(),
    );
  if (!filePath) return next();

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(stripMarkdown(fs.readFileSync(filePath, "utf8")));
}

export function rawMarkdownPlugin(docsRoot: string): Plugin {
  return {
    name: "hooks-docs-raw-markdown",
    configureServer(server: MiddlewareServer) {
      server.middlewares.use((req, res, next) =>
        handleRawMarkdownRequest(docsRoot, req, res, next),
      );
    },
    configurePreviewServer(server: MiddlewareServer) {
      server.middlewares.use((req, res, next) =>
        handleRawMarkdownRequest(docsRoot, req, res, next),
      );
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
