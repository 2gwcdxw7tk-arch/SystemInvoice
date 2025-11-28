"use client";

import { type ComponentProps } from "react";
import Link from "next/link";
import { Ban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LinkHref = ComponentProps<typeof Link>["href"];

interface FeatureGuardNoticeProps {
  title: string;
  description: string;
  actionHref?: LinkHref | string;
  actionLabel?: string;
  className?: string;
}

export function FeatureGuardNotice({
  title,
  description,
  actionHref = "/dashboard",
  actionLabel = "Volver al dashboard",
  className,
}: FeatureGuardNoticeProps): JSX.Element {
  return (
    <section className={cn("flex min-h-[60vh] flex-col items-center justify-center gap-5 px-4 text-center", className)}>
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-muted-foreground/40 bg-muted/40">
        <Ban className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="max-w-2xl space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Button asChild className="rounded-2xl px-6">
        <Link href={actionHref as LinkHref}>{actionLabel}</Link>
      </Button>
    </section>
  );
}
