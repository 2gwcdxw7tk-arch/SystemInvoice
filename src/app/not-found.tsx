import Link from "next/link";
import { FileQuestion, Home, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFound() {
    return (
        <div className="flex min-h-[60vh] items-center justify-center p-4">
            <Card className="w-full max-w-md rounded-3xl border-primary/20 bg-primary/5">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                        <FileQuestion className="h-8 w-8 text-primary" />
                    </div>
                    <CardTitle className="text-2xl font-semibold text-foreground">
                        Página no encontrada
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                        La página que buscas no existe o ha sido movida a otra ubicación.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                        <Button asChild variant="default" className="rounded-2xl">
                            <Link href="/">
                                <Home className="mr-2 h-4 w-4" />
                                Ir al inicio
                            </Link>
                        </Button>
                        <Button asChild variant="outline" className="rounded-2xl">
                            <Link href="javascript:history.back()">
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Volver atrás
                            </Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
