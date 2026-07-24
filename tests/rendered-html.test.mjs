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
  assert.match(product, /Chorda/);
  assert.match(product, /Chord Library/);
  assert.match(product, /Progression Builder/);
  assert.match(product, /Practice Mode/);
  assert.match(product, /On-screen Piano/);
  assert.match(product, /Create the first local account/);
  assert.match(product, /Show All/);
  assert.match(product, /Root Note/);
  assert.match(product, /Notes per Chord/);
  assert.match(product, /Save as New Voicing/);
  assert.match(product, /Delete \$\{voicing\.name\}/);
  assert.match(product, /Skip/);
  assert.match(product, /Back to Setup/);
  assert.match(product, />Back</);
  assert.match(product, /Sound · \{stored\.instrument\}/);
  assert.match(client, /instrument:\s*"Piano"/);
  assert.match(client, /playProgression\(stored\.builder,\s*bpm,\s*stored\.instrument\)/);
  assert.match(client, /chords\.slice\(0,\s*6\)/);
  assert.match(client, /choice-grid challenge-grid/);
  assert.doesNotMatch(product, /codex-preview|Your site is taking shape|react-loading-skeleton/);
  assert.doesNotMatch(client, /Current Family|Selected Voicings|Item Order|Sequential/);
  assert.doesNotMatch(client, />Change Setup</);
  assert.doesNotMatch(client, /stored\.builder\.forEach\([\s\S]*setTimeout\(\(\) => playNotes/);
  assert.doesNotMatch(client, /<option>All Chords<\/option>/);
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
  assert.match(css, /button,[\s\S]*border-radius:\s*0/);
  assert.match(css, /\.chord-card[\s\S]*min-height:\s*224px[\s\S]*border-radius:\s*8px/);
  assert.match(css, /\.degree-chord-grid\.collapsed[\s\S]*repeat\(6,/);
  assert.match(css, /\.challenge-grid[\s\S]*repeat\(3,/);
  assert.match(layout, /og\.png/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
