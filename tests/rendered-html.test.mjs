import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("builds the finished chord-learning product", async () => {
  const [page, client, pitchTraining, adminRoute, serverAuth] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/chord-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/pitch-training.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/users/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/server-auth.ts", import.meta.url), "utf8"),
    access(new URL("../dist/server/index.js", import.meta.url)),
  ]);
  const product = `${page}\n${client}`;
  assert.match(product, /Chorda/);
  assert.match(product, /Chord Library/);
  assert.match(product, /Progression Builder/);
  assert.match(product, /Practice Mode/);
  assert.match(client, /Ear Training/);
  assert.match(client, /Sight Singing/);
  assert.match(pitchTraining, /Single-note Ear Training/);
  assert.match(pitchTraining, /Single-note Sight Singing/);
  assert.match(pitchTraining, /StaffNote/);
  assert.match(pitchTraining, /getUserMedia/);
  assert.match(pitchTraining, /Export CSV/);
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
  assert.match(client, /addPianoSelectionToBuilder/);
  assert.match(client, /setVoicingBass/);
  assert.match(client, /instrument:\s*"Piano"/);
  assert.match(client, /function playBuilderProgression\(\)[\s\S]*playProgression\(stored\.builder,\s*bpm,\s*stored\.instrument,\s*\(\) => loopRef\.current\)/);
  assert.match(client, /startMidiNote\(audioContext,\s*data1,\s*data2,\s*instrumentRef\.current\)/);
  assert.match(client, /command === 0xb0 && data1 === 64/);
  assert.match(client, /await audioContext\.resume\(\)/);
  assert.match(client, /User Management/);
  assert.match(adminRoute, /requireAdministrator\(\)/);
  assert.match(adminRoute, /Password must contain at least 10 characters/);
  assert.match(serverAuth, /ORDER BY created_at ASC, id ASC LIMIT 1/);
  assert.doesNotMatch(adminRoute, /password_hash|password_salt/);
  assert.match(client, /chords\.slice\(0,\s*6\)/);
  assert.match(client, /choice-grid challenge-grid/);
  assert.doesNotMatch(product, /codex-preview|Your site is taking shape|react-loading-skeleton/);
  assert.doesNotMatch(client, /Current Family|Selected Voicings|Item Order|Sequential/);
  assert.doesNotMatch(client, />Change Setup</);
  assert.doesNotMatch(client, /stored\.builder\.forEach\([\s\S]*setTimeout\(\(\) => playNotes/);
  assert.match(client, /function stopProgressionPlayback\(\)/);
  assert.match(client, /stopProgressionPlayback\(\);[\s\S]*new AudioContextClass\(\)/);
  assert.match(client, /shouldLoop\(\)/);
  assert.match(client, /\(\) => loopRef\.current/);
  assert.match(client, /PROGRESSION_TEMPLATES\[stored\.mode\] \?\? \[\]/);
  assert.doesNotMatch(client, /<option>All Chords<\/option>/);
});

test("uses the required local font and product metadata", async () => {
  const [css, layout, packageJson, viteConfig, cacheScript, addUserScript] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/clear-dev-cache.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/add-user.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(css, /font-family:\s*"Caslon"/);
  assert.match(css, /--bg-color:\s*#0f0f0f/);
  assert.match(css, /grid-template:[\s\S]*240px/);
  assert.match(css, /button,[\s\S]*border-radius:\s*0/);
  assert.match(css, /\.chord-card[\s\S]*min-height:\s*224px[\s\S]*border-radius:\s*8px/);
  assert.match(css, /\.degree-chord-grid\.collapsed[\s\S]*repeat\(6,/);
  assert.match(css, /\.challenge-grid[\s\S]*repeat\(3,/);
  assert.match(css, /\.piano button\.target::after[\s\S]*background:\s*#111[\s\S]*border:\s*2px solid #fff[\s\S]*box-shadow:\s*0 0 0 1px #111/);
  assert.match(layout, /og\.png/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(packageJson, /"predev":\s*"node scripts\/clear-dev-cache\.mjs"/);
  assert.match(viteConfig, /"react-server-dom-webpack\/client\.browser"/);
  assert.match(viteConfig, /hmr:\s*false/);
  assert.match(viteConfig, /"Cache-Control":\s*"no-store"/);
  assert.match(cacheScript, /node_modules\/\.vite/);
  assert.doesNotMatch(cacheScript, /\.wrangler/);
  assert.match(packageJson, /"user:add":\s*"node scripts\/add-user\.mjs"/);
  assert.match(addUserScript, /PBKDF2/);
  assert.match(addUserScript, /iterations:\s*210_000/);
  assert.match(addUserScript, /password_hash/);
});
