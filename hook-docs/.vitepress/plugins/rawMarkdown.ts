/** biome-ignore-all lint/correctness/noVoidTypeReturn: we need to return void to satisfy the type */
import * as fs from "node:fs";
import * as path from "node:path";
import type { Plugin } from "vitepress";

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
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return next();
  }

  if (!pathname.endsWith(".md")) return next();

  const filePath = path.resolve(docsRoot, `.${pathname}`);
  if (
    !isWithinDocsRoot(docsRoot, filePath) ||
    !fs.existsSync(filePath) ||
    !fs.statSync(filePath).isFile()
  ) {
    return next();
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(stripMarkdownComments(fs.readFileSync(filePath, "utf8")));
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
