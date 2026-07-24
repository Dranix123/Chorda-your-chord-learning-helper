import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const CREATE_STATE_TABLE = `
  CREATE TABLE IF NOT EXISTS user_states (
    user_id TEXT PRIMARY KEY NOT NULL,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

const EMPTY_STATE = {
  favorites: [],
  builder: [],
  voicings: [],
  progressions: [],
  preference: "contextual",
  key: "C",
  mode: "Major",
  pianoCollapsed: false,
};

async function currentUserId(): Promise<string> {
  const requestHeaders = await headers();
  return requestHeaders.get("oai-authenticated-user-email")?.toLowerCase() ?? "local-demo";
}

async function database() {
  const binding = (env as unknown as { DB: D1Database }).DB;
  await binding.prepare(CREATE_STATE_TABLE).run();
  return binding;
}

export async function GET() {
  try {
    const db = await database();
    const userId = await currentUserId();
    const record = await db
      .prepare("SELECT state_json FROM user_states WHERE user_id = ?")
      .bind(userId)
      .first<{ state_json: string }>();
    return NextResponse.json(record ? JSON.parse(record.state_json) : EMPTY_STATE);
  } catch {
    return NextResponse.json(EMPTY_STATE);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const serialized = JSON.stringify(body);
    if (serialized.length > 1_000_000) {
      return NextResponse.json({ error: "State payload is too large." }, { status: 413 });
    }
    const db = await database();
    const userId = await currentUserId();
    const updatedAt = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO user_states (user_id, state_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           state_json = excluded.state_json,
           updated_at = excluded.updated_at`,
      )
      .bind(userId, serialized, updatedAt)
      .run();
    return NextResponse.json({ ok: true, updatedAt });
  } catch {
    return NextResponse.json({ error: "Could not save state." }, { status: 500 });
  }
}
