import { NextResponse } from "next/server";
import { createSession, database, verifyPassword } from "@/lib/server-auth";

export async function POST(request: Request) {
  const body = (await request.json()) as { username?: string; password?: string };
  const username = body.username?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const db = await database();
  const user = await db
    .prepare(
      `SELECT id, username, password_hash, password_salt, enabled
       FROM users WHERE username_normalized = ?`,
    )
    .bind(username)
    .first<{
      id: string;
      username: string;
      password_hash: string;
      password_salt: string;
      enabled: number;
    }>();

  const valid = user?.enabled === 1 && await verifyPassword(password, user.password_salt, user.password_hash);
  if (!user || !valid) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }
  await createSession(user.id);
  return NextResponse.json({ ok: true, user: { id: user.id, username: user.username, source: "local" } });
}
