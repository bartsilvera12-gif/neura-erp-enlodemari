import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/middleware/require-module";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { cambiarEstadoComandaPg } from "@/lib/comandas/server/comandas-pg";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ESTADOS_COMANDA, type EstadoComanda } from "@/lib/comandas/types";

/** PATCH /api/comandas/[id]/estado — cambia el estado de cocina de la comanda. */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireModule(request, "comandas");
    if (!gate.ok) return NextResponse.json(errorResponse(gate.error), { status: gate.status });
    const auth = gate.auth;
    const { id } = await ctx.params;

    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json(errorResponse("JSON inválido."), { status: 400 }); }
    const estado = (body as { estado?: unknown })?.estado;
    if (typeof estado !== "string" || !ESTADOS_COMANDA.includes(estado as EstadoComanda)) {
      return NextResponse.json(errorResponse("Estado inválido."), { status: 400 });
    }

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const comanda = await cambiarEstadoComandaPg(schema, auth.empresa_id, id, estado as EstadoComanda);
    return NextResponse.json(successResponse({ comanda }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo cambiar el estado.";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
