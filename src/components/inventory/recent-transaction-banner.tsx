"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { Eye, Printer, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

type LinkHref = ComponentProps<typeof Link>["href"];

type RecentInventoryTransactionBannerProps = {
  code: string;
  message?: string;
  detailsHref?: LinkHref;
  onDismiss?: () => void;
};

export function RecentInventoryTransactionBanner({ code, message, detailsHref, onDismiss }: RecentInventoryTransactionBannerProps) {
  const detailHref: LinkHref =
    detailsHref || ({ pathname: "/inventario/documentos", query: { folio: code } } as const);

  function handlePrint() {
    window.open(`/api/inventario/documentos/${encodeURIComponent(code)}?format=html`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-primary/30 bg-primary/5 p-4 md:flex-row md:items-center">
      <div className="flex-1 space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Movimiento registrado</p>
        <p className="text-lg font-semibold text-foreground">{code}</p>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" className="rounded-2xl" asChild>
          <Link href={detailHref} prefetch={false} aria-label={`Ver detalle del documento ${code}`}>
            <Eye className="mr-2 h-4 w-4" />
            Ver detalle
          </Link>
        </Button>
        <Button type="button" className="rounded-2xl" onClick={handlePrint} aria-label={`Imprimir documento ${code}`}>
          <Printer className="mr-2 h-4 w-4" />
          Imprimir
        </Button>
        {onDismiss ? (
          <Button type="button" variant="ghost" className="rounded-2xl text-muted-foreground" onClick={onDismiss} aria-label="Ocultar notificación">
            <XCircle className="mr-2 h-4 w-4" />
            Ocultar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
