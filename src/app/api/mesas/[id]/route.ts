import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getMesaDetallePg } from "@/lib/mesas/server/mesas-pg";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/** GET /api/mesas/[id] — detalle de la mesa: sesión viva + ítems. */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getUserAndEmpresa(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await ctx.params;
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const detalle = await getMesaDetallePg(schema, auth.empresa_id, id);
    if (!detalle) return NextResponse.json(errorResponse("Mesa no encontrada."), { status: 404 });
    return NextResponse.json(successResponse({ detalle }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo cargar la mesa.";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
