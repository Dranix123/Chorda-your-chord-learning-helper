import { NextResponse } from "next/server";
import {
  AuthenticationError,
  database,
  requireUser,
} from "@/lib/server-auth";

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

export async function GET() {
  try {
    const db = await database();
    const user = await requireUser();
    const record = await db
      .prepare("SELECT state_json FROM user_states WHERE user_id = ?")
      .bind(user.id)
      .first<{ state_json: string }>();
    return NextResponse.json(record ? JSON.parse(record.state_json) : EMPTY_STATE);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
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
    const user = await requireUser();
    const updatedAt = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO user_states (user_id, state_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           state_json = excluded.state_json,
           updated_at = excluded.updated_at`,
      )
      .bind(user.id, serialized, updatedAt)
      .run();
    return NextResponse.json({ ok: true, updatedAt });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    return NextResponse.json({ error: "Could not save state." }, { status: 500 });
  }
}
