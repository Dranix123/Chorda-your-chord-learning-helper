import { NextResponse } from "next/server";
import {
  createLocalUser,
  createSession,
  hasLocalUsers,
  isLocalRequest,
} from "@/lib/server-auth";

export async function POST(request: Request) {
  if (!isLocalRequest(request)) {
    return NextResponse.json({ error: "Initial account setup is not available on this host." }, { status: 403 });
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

  const user = await createLocalUser(username, password);
  await createSession(user.id);
  return NextResponse.json({ ok: true, user });
}
