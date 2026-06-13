import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { listarMesasPg } from "@/lib/mesas/server/mesas-pg";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/** GET /api/mesas — todas las mesas con el resumen de su sesión viva. */
export async function GET(request: NextRequest) {
  try {
    const auth = await getUserAndEmpresa(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const mesas = await listarMesasPg(schema, auth.empresa_id);
    return NextResponse.json(successResponse({ mesas }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudieron cargar las mesas.";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
