import assert from "node:assert/strict";
import { test } from "node:test";
import middleware, { config } from "./middleware.ts";

const ORIGIN = "https://docs.example";
const rewriteFor = (path: string, accept?: string) =>
  middleware(new Request(`${ORIGIN}${path}`, { headers: accept ? { accept } : {} })).headers.get(
    "x-middleware-rewrite",
  );

test("rewrites clean page URLs to their .md twin when Markdown is accepted", () => {
  assert.equal(rewriteFor("/overview", "text/markdown"), `${ORIGIN}/overview.md`);
  assert.equal(rewriteFor("/tools/", "text/html, text/markdown;q=0.9"), `${ORIGIN}/tools.md`);
  assert.equal(rewriteFor("/", "text/markdown"), `${ORIGIN}/index.md`);
  assert.equal(rewriteFor("/index", "text/markdown"), `${ORIGIN}/index.md`);
});

test("leaves other requests alone", () => {
  assert.equal(rewriteFor("/overview"), null);
  assert.equal(rewriteFor("/overview", "text/html"), null);
});

test("matcher skips paths with an extension", () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);
  for (const path of ["/", "/overview", "/api-reference/control/"]) assert.match(path, matcher);
  for (const path of ["/overview.md", "/overview.html", "/assets/app.js"])
    assert.doesNotMatch(path, matcher);
});
