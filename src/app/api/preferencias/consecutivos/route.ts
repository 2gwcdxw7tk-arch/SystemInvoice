import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdministrator } from "@/lib/auth/access";
import { sequenceService } from "@/lib/services/SequenceService";

const scopeSchema = z.enum(["INVOICE", "INVENTORY"]);

const numericField = (min: number, max?: number) =>
  z.preprocess((value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value.trim().replace(/,/g, "."));
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }, max === undefined ? z.number().int().min(min) : z.number().int().min(min).max(max));

const createSchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(160),
  scope: scopeSchema,
  prefix: z.string().trim().max(40).default(""),
  suffix: z.string().trim().max(40).optional(),
  padding: numericField(1, 18),
  startValue: numericField(0),
  step: numericField(1).default(1),
  isActive: z.boolean().optional(),
});

const updateSchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(160).optional(),
  prefix: z.string().trim().max(40).optional(),
  suffix: z
    .union([z.string().trim().max(40), z.literal(null)])
    .optional(),
  padding: numericField(1, 18).optional(),
  startValue: numericField(0).optional(),
  step: numericField(1).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede consultar los consecutivos");
  if ("response" in access) return access.response;

  try {
    const scopeParam = request.nextUrl.searchParams.get("scope");
    const scopeResult = scopeParam ? scopeSchema.safeParse(scopeParam.toUpperCase()) : null;
    const scope = scopeResult && scopeResult.success ? scopeResult.data : undefined;
    const items = await sequenceService.listDefinitions(scope);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/preferencias/consecutivos", error);
    return NextResponse.json({ success: false, message: "No se pudieron obtener los consecutivos" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede crear consecutivos");
  if ("response" in access) return access.response;

  const payload = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { code, name, scope, prefix, suffix, padding, startValue, step, isActive } = parsed.data;

  try {
    const definition = await sequenceService.createDefinition({
      code,
      name,
      scope,
      prefix,
      suffix: suffix ?? "",
      padding,
      startValue,
      step,
      isActive,
    });
    return NextResponse.json({ definition }, { status: 201 });
  } catch (error) {
    console.error("POST /api/preferencias/consecutivos", error);
    const message = error instanceof Error ? error.message : "No se pudo crear el consecutivo";
    const status = /existe/i.test(message) ? 409 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede actualizar consecutivos");
  if ("response" in access) return access.response;

  const payload = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos inválidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { code, suffix, ...rest } = parsed.data;
  if (Object.keys(rest).length === 0 && typeof suffix === "undefined") {
    return NextResponse.json({ success: false, message: "Debe indicar al menos un campo a actualizar" }, { status: 400 });
  }

  try {
    const updatePayload: Parameters<typeof sequenceService.updateDefinition>[1] = {
      ...rest,
    };
    if (typeof suffix !== "undefined") {
      updatePayload.suffix = suffix;
    }
    const definition = await sequenceService.updateDefinition(code, updatePayload);
    return NextResponse.json({ definition });
  } catch (error) {
    console.error("PATCH /api/preferencias/consecutivos", error);
    const message = error instanceof Error ? error.message : "No se pudo actualizar el consecutivo";
    const status = /no existe/i.test(message) ? 404 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
