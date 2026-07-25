import { randomUUID, webcrypto } from "node:crypto";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,40}$/;
const databaseDirectory = fileURLToPath(
  new URL(
    "../.wrangler/state/v3/d1/miniflare-D1DatabaseObject/",
    import.meta.url,
  ),
);

async function findDatabase() {
  let entries;
  try {
    entries = await readdir(databaseDirectory, { withFileTypes: true });
  } catch {
    throw new Error("Local database not found. Run `npm run dev` once first.");
  }

  const candidates = entries
    .filter(
      (entry) =>
        entry.isFile()
        && entry.name.endsWith(".sqlite")
        && entry.name !== "metadata.sqlite",
    )
    .map((entry) => `${databaseDirectory}${entry.name}`);

  const applicationDatabases = candidates.filter((filename) => {
    const database = new DatabaseSync(filename, { readOnly: true });
    const usersTable = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'",
      )
      .get();
    database.close();
    return Boolean(usersTable);
  });

  if (applicationDatabases.length !== 1) {
    throw new Error("Could not identify the Chorda local database.");
  }
  return applicationDatabases[0];
}

async function readPassword() {
  if (!process.stdin.isTTY) {
    let value = "";
    for await (const chunk of process.stdin) value += chunk;
    return value.replace(/[\r\n]+$/, "");
  }

  return new Promise((resolve, reject) => {
    let value = "";
    process.stdout.write("Password: ");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const finish = (error) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (character) => {
      if (character === "\u0003") {
        finish(new Error("Cancelled."));
      } else if (character === "\r" || character === "\n") {
        finish();
      } else if (character === "\u007f") {
        value = value.slice(0, -1);
      } else {
        value += character;
      }
    };

    process.stdin.on("data", onData);
  });
}

async function hashPassword(password) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const key = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await webcrypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 210_000 },
    key,
    256,
  );
  return {
    hash: Buffer.from(bits).toString("base64"),
    salt: Buffer.from(salt).toString("base64"),
  };
}

const username = process.argv[2]?.trim() ?? "";
if (!USERNAME_PATTERN.test(username)) {
  throw new Error(
    "Usage: npm run user:add -- <3-40 letter, number, dot, dash, or underscore username>",
  );
}

const password = process.env.CHORDA_USER_PASSWORD ?? await readPassword();
if (password.length < 10) {
  throw new Error("Password must contain at least 10 characters.");
}

const database = new DatabaseSync(await findDatabase());
const normalizedUsername = username.toLowerCase();
const existing = database
  .prepare("SELECT id FROM users WHERE username_normalized = ?")
  .get(normalizedUsername);
if (existing) {
  database.close();
  throw new Error(`Username "${username}" already exists.`);
}

const credentials = await hashPassword(password);
const timestamp = new Date().toISOString();
database
  .prepare(
    `INSERT INTO users
     (id, username, username_normalized, password_hash, password_salt, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  )
  .run(
    randomUUID(),
    username,
    normalizedUsername,
    credentials.hash,
    credentials.salt,
    timestamp,
    timestamp,
  );
database.close();
console.log(`Created local user "${username}".`);
