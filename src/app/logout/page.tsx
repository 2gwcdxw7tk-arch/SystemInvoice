import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createEmptySessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export default async function LogoutPage() {
  const session = createEmptySessionCookie();
  const store = await cookies();

  store.set({
    name: SESSION_COOKIE_NAME,
    value: session.value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: session.expires,
    path: "/",
  });

  redirect("/?logout=1");
}
