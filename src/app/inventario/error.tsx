"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ErrorPageProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export default function InventarioError({ error, reset }: ErrorPageProps) {
    useEffect(() => {
        console.error("Inventory module error:", error);
    }, [error]);

    return (
        <div className="container mx-auto flex min-h-[50vh] items-center justify-center p-4">
            <Card className="w-full max-w-md rounded-3xl border-amber-500/20 bg-amber-500/5">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
                        <AlertTriangle className="h-8 w-8 text-amber-600" />
                    </div>
                    <CardTitle className="text-2xl font-semibold text-foreground">
                        Error en Inventario
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                        Ocurrió un problema al cargar esta sección. Puedes intentar recargar o volver al menú de inventario.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {process.env.NODE_ENV === "development" && error.message && (
                        <div className="rounded-2xl bg-muted/50 p-4">
                            <p className="text-xs font-medium text-muted-foreground">Error:</p>
                            <p className="mt-1 break-words font-mono text-sm text-foreground">{error.message}</p>
                        </div>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                        <Button onClick={reset} variant="default" className="rounded-2xl">
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Reintentar
                        </Button>
                        <Button asChild variant="outline" className="rounded-2xl">
                            <Link href="/inventario">
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Volver a Inventario
                            </Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
