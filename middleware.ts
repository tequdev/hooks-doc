import { next, rewrite } from "@vercel/functions";

/**
 * Serves a page's Markdown when the client asks for it with `Accept: text/markdown`,
 * even though the requested path is the clean page URL (e.g. `/overview` instead of
 * `/overview.md`). Vercel checks the filesystem before applying `vercel.json`
 * rewrites, so only middleware can intercept a URL that already resolves to HTML.
 *
 * The build emits `<page>.md` next to every `<page>.html`, including `index.md` for
 * the site root. Vercel treats `/index` as an alias of `/` when matching middleware
 * routes, so both map to `/index.md`.
 */
export default function middleware(request: Request): Response {
  if (!request.headers.get("accept")?.includes("text/markdown")) return next();
  const url = new URL(request.url);
  const page = url.pathname.replace(/\/$/, "");
  url.pathname = `${page || "/index"}.md`;
  return rewrite(url);
}

export const config = {
  // Only extensionless page URLs; assets, `.md`, and `.html` requests never enter here.
  matcher: ["/((?!.*\\.).*)"],
};
