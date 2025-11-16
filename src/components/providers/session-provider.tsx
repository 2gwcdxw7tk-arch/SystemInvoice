"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { SessionPayload } from "@/lib/auth/session";

type SessionContextValue = {
  session: SessionPayload | null;
  setSession: Dispatch<SetStateAction<SessionPayload | null>>;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ value, children }: { value: SessionPayload | null; children: ReactNode }) {
  const [session, setSession] = useState<SessionPayload | null>(value);

  useEffect(() => {
    setSession(value);
  }, [value]);

  const contextValue = useMemo<SessionContextValue>(() => ({ session, setSession }), [session]);

  return <SessionContext.Provider value={contextValue}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionPayload | null {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession debe usarse dentro de un SessionProvider");
  }
  return context.session;
}

export function useSessionActions(): {
  setSession: Dispatch<SetStateAction<SessionPayload | null>>;
  clearSession: () => void;
} {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSessionActions debe usarse dentro de un SessionProvider");
  }

  const clearSession = () => context.setSession(null);

  return {
    setSession: context.setSession,
    clearSession,
  };
}
