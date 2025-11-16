import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdministrator } from "@/lib/auth/access";
import { ArticleClassificationService } from "@/lib/services/ArticleClassificationService";

const classificationService = new ArticleClassificationService();

const upsertSchema = z
  .object({
    id: z.number().int().positive().optional(),
    code: z.string().trim().min(1).max(24).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    parentFullCode: z.string().trim().min(1).max(24).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.id) {
      if (!data.code) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El código es obligatorio", path: ["code"] });
      }
      if (!data.name) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El nombre es obligatorio", path: ["name"] });
      }
    } else if (data.name === undefined && data.isActive === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "No hay cambios para guardar", path: ["name"] });
    }
  });

export async function GET(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede consultar clasificaciones");
  if ("response" in access) return access.response;

  const { searchParams } = request.nextUrl;
  const levelParam = searchParams.get("level");
  const parentParam = searchParams.get("parent_full_code");
  const includeInactiveParam = searchParams.get("include_inactive");

  const level = levelParam ? Number(levelParam) : undefined;
  const includeInactive = includeInactiveParam === "true" || includeInactiveParam === "1";
  const parentFullCode = parentParam === null ? undefined : parentParam || null;

  try {
    const items = await classificationService.list({
      level: Number.isNaN(level) ? undefined : level,
      parentFullCode,
      includeInactive,
    });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/preferencias/clasificaciones", error);
    return NextResponse.json({ success: false, message: "No se pudieron obtener las clasificaciones" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede administrar clasificaciones");
  if ("response" in access) return access.response;

  const body = await request.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }

  const { id, code, name, parentFullCode, isActive } = parsed.data;

  try {
    if (!id) {
      const classification = await classificationService.create({
        code: code ?? "",
        name: name ?? "",
        parentFullCode: parentFullCode ?? null,
        isActive,
      });
      return NextResponse.json({ classification }, { status: 201 });
    }

    const classification = await classificationService.update(id, {
      name,
      isActive,
    });
    return NextResponse.json({ classification });
  } catch (error) {
    console.error("POST /api/preferencias/clasificaciones", error);
    const message = error instanceof Error ? error.message : "No se pudo guardar la clasificación";
    const status = message.toLowerCase().includes("existe") ? 409 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
