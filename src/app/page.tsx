"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { Loader2, Lock, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

type LoginMode = "admin" | "waiter";

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<LoginMode>("admin");
  const redirectTarget = useMemo<Route | null>(() => {
    const value = searchParams?.get("redirect");
    if (!value) return null;
    // Evita redirecciones abiertas a dominios externos
    if (!value.startsWith("/")) {
      return null;
    }
    return value as Route;
  }, [searchParams]);

  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [waiterPin, setWaiterPin] = useState("");
  const [isPending, startTransition] = useTransition();

  const maxPinLength = 6;

  const handleModeChange = (nextMode: LoginMode) => {
    if (mode === nextMode) {
      return;
    }

    setMode(nextMode);
    setMessage(null);
    setWaiterPin("");
  };

  const handleDigitPress = (digit: string) => {
    setWaiterPin((current) => {
      if (current.length >= maxPinLength) {
        return current;
      }

      return `${current}${digit}`;
    });
  };

  const handleBackspace = () => {
    setWaiterPin((current) => current.slice(0, -1));
  };

  const handleClear = () => {
    setWaiterPin("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload: Record<string, unknown> = {
      role: mode,
    };

    if (mode === "admin") {
      payload.username = (formData.get("username") as string | null)?.trim();
      payload.password = formData.get("password") as string | null;
    } else {
      if (waiterPin.length < 4) {
        setMessage({ type: "error", text: "El PIN debe tener al menos 4 dígitos" });
        return;
      }

      payload.pin = waiterPin;
    }

    startTransition(async () => {
      setMessage(null);

      try {
        const response = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          setMessage({ type: "error", text: data.message ?? "No se pudo iniciar sesión" });
          return;
        }

        setMessage({ type: "success", text: data.message ?? "Acceso concedido" });
        form.reset();
        setWaiterPin("");

        const defaultAdminRoute: Route = "/dashboard";
        const defaultWaiterRoute: Route = "/meseros/comandas";
        const isAllowedWaiterRedirect = (target: Route | null): target is Route => {
          if (!target) return false;
          return target.startsWith("/meseros");
        };

        const destination: Route =
          mode === "waiter"
            ? isAllowedWaiterRedirect(redirectTarget)
              ? redirectTarget
              : defaultWaiterRoute
            : redirectTarget ?? defaultAdminRoute;

        router.push(destination);
      } catch (error) {
        console.error("Error al autenticar", error);
        setMessage({ type: "error", text: "No se pudo contactar el servidor" });
      }
    });
  };

  const keypadKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "limpiar", "0", "borrar"] as const;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-muted/20 py-10">
      <Card className="w-full max-w-2xl border-none shadow-2xl shadow-primary/15">
        <CardHeader className="space-y-6 text-center">
          <CardTitle className="text-3xl font-semibold tracking-tight">{siteConfig.name}</CardTitle>
          <CardDescription className="text-base">
            Opera el punto de venta con una interfaz táctil optimizada para equipos administrativos y de salón.
          </CardDescription>
          <div className="relative mx-auto flex w-full max-w-xl items-stretch">
            <div className="relative grid h-16 w-full grid-cols-2 overflow-hidden rounded-full bg-muted/60 p-1 text-sm font-semibold">
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-y-1 w-1/2 rounded-full bg-background shadow transition-transform duration-300 ease-out",
                  mode === "waiter" ? "translate-x-full" : "translate-x-0"
                )}
              />
              <button
                type="button"
                className={cn(
                  "relative z-10 flex items-center justify-center gap-2 rounded-full text-base transition-colors",
                  mode === "admin" ? "text-primary" : "text-muted-foreground"
                )}
                aria-pressed={mode === "admin"}
                onClick={() => handleModeChange("admin")}
                disabled={isPending}
              >
                <Lock className="h-5 w-5" />
                Admin
              </button>
              <button
                type="button"
                className={cn(
                  "relative z-10 flex items-center justify-center gap-2 rounded-full text-base transition-colors",
                  mode === "waiter" ? "text-primary" : "text-muted-foreground"
                )}
                aria-pressed={mode === "waiter"}
                onClick={() => handleModeChange("waiter")}
                disabled={isPending}
              >
                <Users className="h-5 w-5" />
                Mesero
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-8" onSubmit={handleSubmit}>
            <input type="hidden" name="pin" value={waiterPin} />
            {mode === "admin" ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Input
                    id="username"
                    name="username"
                    type="text"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="admin"
                    autoComplete="username"
                    required
                    disabled={isPending}
                    className="h-14 text-lg"
                  />
                </div>
                <div className="space-y-2">
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Contraseña"
                    required
                    disabled={isPending}
                    className="h-14 text-lg"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex justify-center gap-3">
                  {Array.from({ length: maxPinLength }).map((_, index) => (
                    <div
                      key={`pin-slot-${index}`}
                      className={cn(
                        "flex h-14 w-12 items-center justify-center rounded-xl border-2 text-2xl font-semibold transition-colors",
                        index < waiterPin.length ? "border-primary text-primary" : "border-dashed border-muted-foreground/40 text-muted-foreground/70"
                      )}
                    >
                        {waiterPin[index] ? "\u2022" : ""}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {keypadKeys.map((key) => {
                    const isAction = key === "limpiar" || key === "borrar";
                    const label = key === "limpiar" ? "Limpiar" : key === "borrar" ? "Borrar" : key;

                    const handleKeyPress = () => {
                      if (isPending) {
                        return;
                      }

                      if (key === "limpiar") {
                        handleClear();
                        return;
                      }

                      if (key === "borrar") {
                        handleBackspace();
                        return;
                      }

                      handleDigitPress(key);
                    };

                    return (
                      <Button
                        key={key}
                        type="button"
                        variant={isAction ? "secondary" : "outline"}
                        className={cn(
                          "h-16 text-xl font-semibold",
                          isAction ? "text-muted-foreground" : "text-foreground"
                        )}
                        onClick={handleKeyPress}
                        disabled={isPending}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="h-14 w-full text-lg"
              disabled={isPending || (mode === "waiter" && waiterPin.length < 4)}
            >
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Verificando
                </span>
              ) : (
                <>Ingresar</>
              )}
            </Button>

            {message && (
              <p
                className={cn(
                  "text-center text-sm",
                  message.type === "success" ? "text-emerald-600" : "text-destructive"
                )}
              >
                {message.text}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
