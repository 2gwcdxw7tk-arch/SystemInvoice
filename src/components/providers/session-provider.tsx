"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { SessionPayload } from "@/lib/auth/session";

const SessionContext = createContext<SessionPayload | null>(null);

export function SessionProvider({ value, children }: { value: SessionPayload | null; children: ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionPayload | null {
  return useContext(SessionContext);
}
