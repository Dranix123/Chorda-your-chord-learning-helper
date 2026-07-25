import { env } from "cloudflare:workers";
import { cookies, headers } from "next/headers";

const SESSION_COOKIE = "harmonic_session";
const SESSION_DAYS = 30;

const CREATE_USERS_TABLE = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT NOT NULL,
    username_normalized TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

const CREATE_SESSIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`;

const CREATE_STATES_TABLE = `
  CREATE TABLE IF NOT EXISTS user_states (
    user_id TEXT PRIMARY KEY NOT NULL,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

export type AuthUser = {
  id: string;
  username: string;
  source: "local" | "workspace";
  isAdmin: boolean;
};

export class AuthenticationError extends Error {}
export class AuthorizationError extends Error {}
export class UsernameUnavailableError extends Error {}

export async function database() {
  const binding = (env as unknown as { DB: D1Database }).DB;
  await binding.batch([
    binding.prepare(CREATE_USERS_TABLE),
    binding.prepare(CREATE_SESSIONS_TABLE),
    binding.prepare(CREATE_STATES_TABLE),
  ]);
  return binding;
}

export async function currentUser(): Promise<AuthUser | null> {
  const requestHeaders = await headers();
  const workspaceEmail = requestHeaders.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (workspaceEmail) {
    const encodedName = requestHeaders.get("oai-authenticated-user-full-name");
    const username = encodedName ? safeDecode(encodedName) ?? workspaceEmail : workspaceEmail;
    return { id: `workspace:${workspaceEmail}`, username, source: "workspace", isAdmin: false };
  }

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const db = await database();
  const now = new Date().toISOString();
  const record = await db
    .prepare(
      `SELECT users.id, users.username
       FROM sessions
       INNER JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = ? AND sessions.expires_at > ? AND users.enabled = 1`,
    )
    .bind(sessionId, now)
    .first<{ id: string; username: string }>();
  return record
    ? { ...record, source: "local", isAdmin: await isLocalAdministrator(record.id) }
    : null;
}

export async function requireUser(): Promise<AuthUser> {
  const user = await currentUser();
  if (!user) throw new AuthenticationError("Authentication required");
  return user;
}

export async function requireAdministrator(): Promise<AuthUser> {
  const user = await requireUser();
  if (!user.isAdmin) throw new AuthorizationError("Administrator access required");
  return user;
}

export async function isLocalAdministrator(userId: string): Promise<boolean> {
  const db = await database();
  const firstUser = await db
    .prepare("SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1")
    .first<{ id: string }>();
  return firstUser?.id === userId;
}

export async function createLocalUser(username: string, password: string): Promise<AuthUser> {
  const db = await database();
  const normalizedUsername = username.toLowerCase();
  const existing = await db
    .prepare("SELECT id FROM users WHERE username_normalized = ?")
    .bind(normalizedUsername)
    .first<{ id: string }>();
  if (existing) throw new UsernameUnavailableError("Username already exists.");

  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const credentials = await hashPassword(password);
  await db
    .prepare(
      `INSERT INTO users
       (id, username, username_normalized, password_hash, password_salt, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(id, username, normalizedUsername, credentials.hash, credentials.salt, timestamp, timestamp)
    .run();
  return { id, username, source: "local", isAdmin: await isLocalAdministrator(id) };
}

export async function hasLocalUsers(): Promise<boolean> {
  const db = await database();
  const row = await db.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();
  return Number(row?.count ?? 0) > 0;
}

export function isLocalRequest(request: Request): boolean {
  const host = new URL(request.url).hostname;
  return host === "localhost"
    || host === "127.0.0.1"
    || host === "::1"
    || host === "chords.vulpolirant.com"
    || host === "chorda.vulpollirant.com";
}

export async function hashPassword(password: string, salt?: Uint8Array) {
  const actualSalt = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: actualSalt, iterations: 210_000 },
    key,
    256,
  );
  return {
    hash: bytesToBase64(new Uint8Array(bits)),
    salt: bytesToBase64(actualSalt),
  };
}

export async function verifyPassword(password: string, salt: string, expected: string) {
  const candidate = await hashPassword(password, base64ToBytes(salt));
  if (candidate.hash.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= candidate.hash.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export async function createSession(userId: string) {
  const db = await database();
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_DAYS * 86_400_000);
  await db
    .prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(id, userId, createdAt.toISOString(), expiresAt.toISOString())
    .run();
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "";
  cookieStore.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "strict",
    secure: !host.startsWith("localhost") && !host.startsWith("127.0.0.1"),
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    const db = await database();
    await db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
  }
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/",
    maxAge: 0,
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
