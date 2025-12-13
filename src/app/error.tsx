"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ErrorPageProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export default function Error({ error, reset }: ErrorPageProps) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error("Application error:", error);
    }, [error]);

    return (
        <div className="flex min-h-[60vh] items-center justify-center p-4">
            <Card className="w-full max-w-md rounded-3xl border-destructive/20 bg-destructive/5">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                        <AlertTriangle className="h-8 w-8 text-destructive" />
                    </div>
                    <CardTitle className="text-2xl font-semibold text-foreground">
                        Algo salió mal
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                        Ha ocurrido un error inesperado. Puedes intentar recargar la página o volver al inicio.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {process.env.NODE_ENV === "development" && error.message && (
                        <div className="rounded-2xl bg-muted/50 p-4">
                            <p className="text-xs font-medium text-muted-foreground">Detalles del error:</p>
                            <p className="mt-1 break-words font-mono text-sm text-foreground">{error.message}</p>
                            {error.digest && (
                                <p className="mt-2 text-xs text-muted-foreground">Digest: {error.digest}</p>
                            )}
                        </div>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                        <Button
                            onClick={reset}
                            variant="default"
                            className="rounded-2xl"
                        >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Intentar de nuevo
                        </Button>
                        <Button
                            asChild
                            variant="outline"
                            className="rounded-2xl"
                        >
                            <Link href="/">
                                <Home className="mr-2 h-4 w-4" />
                                Ir al inicio
                            </Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
