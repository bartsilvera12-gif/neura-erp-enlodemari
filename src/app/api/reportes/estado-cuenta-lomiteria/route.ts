import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getEstadoCuentaPg } from "@/lib/caja/server/caja-pg";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/reportes/estado-cuenta-lomiteria?desde=yyyy-mm-dd&hasta=yyyy-mm-dd
 * Agregado financiero sobre cajas cerradas en el rango (por fecha_cierre).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getUserAndEmpresa(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const url = new URL(request.url);
    const desde = url.searchParams.get("desde");
    const hasta = url.searchParams.get("hasta");
    const estado = await getEstadoCuentaPg(schema, auth.empresa_id, desde || null, hasta || null);
    return NextResponse.json(successResponse({ estado }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo cargar el estado de cuenta.";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
