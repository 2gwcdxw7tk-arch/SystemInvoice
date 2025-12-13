"use client";

import { useEffect } from "react";
import { AlertOctagon, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface GlobalErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
    useEffect(() => {
        console.error("Global error:", error);
    }, [error]);

    return (
        <html lang="es">
            <body className="bg-background text-foreground">
                <div className="flex min-h-screen items-center justify-center p-4">
                    <Card className="w-full max-w-md rounded-3xl border-destructive/20 bg-destructive/5">
                        <CardHeader className="text-center">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                                <AlertOctagon className="h-8 w-8 text-destructive" />
                            </div>
                            <CardTitle className="text-2xl font-semibold">
                                Error crítico
                            </CardTitle>
                            <CardDescription>
                                Ha ocurrido un error grave en la aplicación. Por favor, recarga la página.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {process.env.NODE_ENV === "development" && error.message && (
                                <div className="rounded-2xl bg-gray-100 p-4">
                                    <p className="text-xs font-medium text-gray-500">Error:</p>
                                    <p className="mt-1 break-words font-mono text-sm">{error.message}</p>
                                </div>
                            )}
                            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                                <Button onClick={reset} className="rounded-2xl">
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Recargar
                                </Button>
                                <Button asChild variant="outline" className="rounded-2xl">
                                    <Link href="/">
                                        <Home className="mr-2 h-4 w-4" />
                                        Ir al inicio
                                    </Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </body>
        </html>
    );
}
