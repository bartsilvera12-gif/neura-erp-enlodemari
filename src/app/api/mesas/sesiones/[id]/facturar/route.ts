import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { facturarSesionPg } from "@/lib/mesas/server/mesas-pg";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * POST /api/mesas/sesiones/[id]/facturar — convierte la cuenta en venta.
 * Idempotente: si la sesión ya tiene venta_id, no crea otra. Exige caja abierta.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getUserAndEmpresa(request);
    if (!auth) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { id } = await ctx.params;

    let body: unknown = {};
    try { body = await request.json(); } catch { /* sin body → efectivo por defecto */ }
    const o = (body ?? {}) as Record<string, unknown>;
    const metodoPago: "efectivo" | "tarjeta" | "transferencia" =
      o.metodo_pago === "tarjeta" || o.metodo_pago === "transferencia" ? o.metodo_pago : "efectivo";

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const result = await facturarSesionPg({
      schema, empresaId: auth.empresa_id, sesionId: id,
      metodoPago, usuarioId: auth.usuarioCatalogId ?? null,
    });
    return NextResponse.json(successResponse(result));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo facturar la mesa.";
    const status =
      msg.includes("abrir caja") || msg.includes("no tiene productos") || msg.includes("cancelada") || msg.includes("se está facturando")
        ? 409
        : msg.includes("no encontrada")
        ? 404
        : 500;
    return NextResponse.json(errorResponse(msg), { status });
  }
}
