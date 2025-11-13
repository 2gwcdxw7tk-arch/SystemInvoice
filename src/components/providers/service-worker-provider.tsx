"use client";

import { useEffect, type ReactNode } from "react";

export function ServiceWorkerProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      return;
    }
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      } catch (error) {
        console.error("No se pudo registrar el Service Worker", error);
      }
    };

    void register();

    return () => {
      // No se necesita desmontaje específico
    };
  }, []);

  return <>{children}</>;
}
