import { NextResponse } from "next/server";

import { createEmptySessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { env } from "@/lib/env";

export async function GET() {
  const session = createEmptySessionCookie();
  const url = new URL("/?logout=1", env.appUrl);
  const response = NextResponse.redirect(url);

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: session.value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: session.expires,
    path: "/",
  });

  return response;
}
