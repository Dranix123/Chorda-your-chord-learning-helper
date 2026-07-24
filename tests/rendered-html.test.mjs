import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("builds the finished chord-learning product", async () => {
  const [page, client] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/chord-app.tsx", import.meta.url), "utf8"),
    access(new URL("../dist/server/index.js", import.meta.url)),
  ]);
  const product = `${page}\n${client}`;
  assert.match(product, /Harmonic Practice/);
  assert.match(product, /Chord Library/);
  assert.match(product, /Progression Builder/);
  assert.match(product, /Practice Mode/);
  assert.match(product, /On-screen Piano/);
  assert.doesNotMatch(product, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("uses the required local font and product metadata", async () => {
  const [css, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(css, /font-family:\s*"Caslon"/);
  assert.match(css, /--bg-color:\s*#0f0f0f/);
  assert.match(css, /grid-template:[\s\S]*240px/);
  assert.match(layout, /og\.png/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
