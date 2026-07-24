import { NextResponse } from "next/server";
import {
  createSession,
  database,
  hasLocalUsers,
  hashPassword,
  isLocalRequest,
} from "@/lib/server-auth";

export async function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "Initial account setup is available only on localhost." }, { status: 403 });
  }
  if (await hasLocalUsers()) {
    return NextResponse.json({ error: "Initial account setup is already complete." }, { status: 409 });
  }
  const body = (await request.json()) as { username?: string; password?: string };
  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) {
    return NextResponse.json({ error: "Username must be 3–40 letters, numbers, dots, dashes, or underscores." }, { status: 400 });
  }
  if (password.length < 10) {
    return NextResponse.json({ error: "Password must contain at least 10 characters." }, { status: 400 });
  }

  const db = await database();
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const credentials = await hashPassword(password);
  await db
    .prepare(
      `INSERT INTO users
       (id, username, username_normalized, password_hash, password_salt, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(id, username, username.toLowerCase(), credentials.hash, credentials.salt, timestamp, timestamp)
    .run();
  await createSession(id);
  return NextResponse.json({ ok: true, user: { id, username, source: "local" } });
}
