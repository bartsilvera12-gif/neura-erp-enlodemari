import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { enviarACajaPg } from "@/lib/mesas/server/mesas-pg";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/** POST /api/mesas/[id]/enviar-caja — marca la cuenta como por_cobrar. NO crea venta. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getUserAndEmpresa(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await ctx.params;
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const sesion = await enviarACajaPg(schema, auth.empresa_id, id);
    return NextResponse.json(successResponse({ sesion }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo enviar a caja.";
    const status = msg.includes("no tiene") ? 409 : 500;
    return NextResponse.json(errorResponse(msg), { status });
  }
}
