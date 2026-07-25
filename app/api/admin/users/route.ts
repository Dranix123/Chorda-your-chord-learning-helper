import { NextResponse } from "next/server";
import {
  AuthenticationError,
  AuthorizationError,
  createLocalUser,
  database,
  requireAdministrator,
  UsernameUnavailableError,
} from "@/lib/server-auth";

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,40}$/;

function accessError(error: unknown) {
  if (error instanceof AuthenticationError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof AuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  throw error;
}

export async function GET() {
  try {
    await requireAdministrator();
    const db = await database();
    const result = await db
      .prepare("SELECT id, username, enabled, created_at FROM users ORDER BY created_at ASC, id ASC")
      .all<{ id: string; username: string; enabled: number; created_at: string }>();
    return NextResponse.json({
      users: result.results.map((user, index) => ({
        id: user.id,
        username: user.username,
        enabled: user.enabled === 1,
        createdAt: user.created_at,
        isAdmin: index === 0,
      })),
    });
  } catch (error) {
    return accessError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdministrator();
    const body = (await request.json()) as { username?: string; password?: string };
    const username = body.username?.trim() ?? "";
    const password = body.password ?? "";
    if (!USERNAME_PATTERN.test(username)) {
      return NextResponse.json(
        { error: "Username must be 3–40 letters, numbers, dots, dashes, or underscores." },
        { status: 400 },
      );
    }
    if (password.length < 10) {
      return NextResponse.json(
        { error: "Password must contain at least 10 characters." },
        { status: 400 },
      );
    }
    const user = await createLocalUser(username, password);
    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (error) {
    if (error instanceof UsernameUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return accessError(error);
  }
}
