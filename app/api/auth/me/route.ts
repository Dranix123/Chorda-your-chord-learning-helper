import { NextResponse } from "next/server";
import { currentUser, hasLocalUsers } from "@/lib/server-auth";

export async function GET() {
  const user = await currentUser();
  if (user) return NextResponse.json({ authenticated: true, user });
  return NextResponse.json({
    authenticated: false,
    canBootstrap: !(await hasLocalUsers()),
  });
}
