import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { actualizarItemPg } from "@/lib/mesas/server/mesas-pg";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/** PATCH /api/mesas/items/[itemId] — actualiza cantidad/observación o cancela el ítem. */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ itemId: string }> }) {
  try {
    const auth = await getUserAndEmpresa(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { itemId } = await ctx.params;

    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }
    const o = (body ?? {}) as Record<string, unknown>;

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const item = await actualizarItemPg({
      schema, empresaId: auth.empresa_id, itemId,
      cantidad: o.cantidad != null ? Number(o.cantidad) : undefined,
      observacion: o.observacion !== undefined ? (o.observacion == null ? null : String(o.observacion).slice(0, 2000)) : undefined,
      cancelar: o.cancelar === true,
    });
    return NextResponse.json(successResponse({ item }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo actualizar el ítem.";
    const status = msg.includes("no encontrado") ? 404 : msg.includes("mayor a 0") || msg.includes("Nada para") ? 400 : 500;
    return NextResponse.json(errorResponse(msg), { status });
  }
}
