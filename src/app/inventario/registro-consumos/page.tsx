"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RegistroConsumosPage() {
  return (
    <section className="space-y-10 pb-16">
      <Card className="rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Registro de consumos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            La logica de esta pantalla esta pendiente de implementacion.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
