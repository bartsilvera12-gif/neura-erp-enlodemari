import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

type TableKey =
  | "clientes"
  | "facturas"
  | "pagos"
  | "tipificaciones"
  | "productos"
  | "ventas"
  | "ventas_items"
  | "compras"
  | "gastos"
  | "suscripciones"
  | "clientes_baja_mes"
  | "suscripciones_canceladas";

/**
 * Antes: si **cualquier** consulta fallaba (p. ej. `clientes.deleted_at` inexistente en un tenant clonado),
 * se respondía 400 y el dashboard quedaba **entero** vacío (incluido financiero con facturas/pagos válidos).
 * Ahora: se devuelven arrays por tabla; errores PostgREST van en `query_errors` sin tumbar el resto.
 */
function pickRows<T>(
  key: TableKey,
  result: { data: T[] | null; error: { message: string } | null },
  errors: Partial<Record<TableKey, string>>
): T[] {
  if (result.error) {
    errors[key] = result.error.message;
    return [];
  }
  return result.data ?? [];
}

/**
 * GET /api/dashboard/tenant-tables
 * Filas de tablas operativas para el dashboard (misma empresa, service role + schema tenant).
 * Evita depender del cliente browser + RLS en esquemas `erp_*`.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { auth, supabase } = ctx;
    const empresaId = auth.empresa_id;

    const now = new Date();
    const anio = now.getFullYear();
    const mes = now.getMonth() + 1;
    const inicioMes = `${anio}-${String(mes).padStart(2, "0")}-01`;
    const finMes = `${anio}-${String(mes).padStart(2, "0")}-31`;

    const includeDebug = request.nextUrl.searchParams.get("debug") === "1";
    const dataSchema = includeDebug ? await fetchDataSchemaForEmpresaId(empresaId) : null;

    const [
      clientesQ,
      facturasQ,
      pagosQ,
      tipificacionesQ,
      productosQ,
      ventasQ,
      ventasItemsQ,
      comprasQ,
      gastosQ,
      suscripcionesDashQ,
      bajasQ,
      suscBajasQ,
    ] = await Promise.all([
      /** Sin `.is("deleted_at", null)` en PostgREST: en tenants viejos la columna puede no existir y rompía todo el batch. */
      supabase.from("clientes").select("*").eq("empresa_id", empresaId),
      supabase.from("facturas").select("*").eq("empresa_id", empresaId),
      supabase.from("pagos").select("id, factura_id, monto, fecha_pago").eq("empresa_id", empresaId),
      supabase.from("tipificaciones").select("*").eq("empresa_id", empresaId),
      supabase.from("productos").select("*").eq("empresa_id", empresaId),
      supabase.from("ventas").select("*").eq("empresa_id", empresaId),
      supabase.from("ventas_items").select("*").eq("empresa_id", empresaId),
      supabase.from("compras").select("*").eq("empresa_id", empresaId),
      supabase.from("gastos").select("id, monto, fecha").eq("empresa_id", empresaId),
      supabase
        .from("suscripciones")
        .select("id, cliente_id, precio, moneda, fecha_inicio, created_at")
        .eq("empresa_id", empresaId),
      supabase
        .from("clientes")
        .select("id")
        .eq("empresa_id", empresaId)
        .not("baja_operativa_at", "is", null)
        .gte("baja_operativa_at", inicioMes)
        .lte("baja_operativa_at", finMes + "T23:59:59.999Z"),
      supabase
        .from("suscripciones")
        .select("cliente_id, precio")
        .eq("empresa_id", empresaId)
        .eq("estado", "cancelada"),
    ]);

    const queryErrors: Partial<Record<TableKey, string>> = {};

    const payload = {
      clientes: pickRows("clientes", clientesQ, queryErrors),
      facturas: pickRows("facturas", facturasQ, queryErrors),
      pagos: pickRows("pagos", pagosQ, queryErrors),
      tipificaciones: pickRows("tipificaciones", tipificacionesQ, queryErrors),
      productos: pickRows("productos", productosQ, queryErrors),
      ventas: pickRows("ventas", ventasQ, queryErrors),
      ventas_items: pickRows("ventas_items", ventasItemsQ, queryErrors),
      compras: pickRows("compras", comprasQ, queryErrors),
      gastos: pickRows("gastos", gastosQ, queryErrors),
      suscripciones: pickRows("suscripciones", suscripcionesDashQ, queryErrors),
      clientes_baja_mes: pickRows("clientes_baja_mes", bajasQ, queryErrors),
      suscripciones_canceladas: pickRows("suscripciones_canceladas", suscBajasQ, queryErrors),
      ...(Object.keys(queryErrors).length > 0 ? { query_errors: queryErrors } : {}),
      ...(includeDebug && dataSchema ? { _debug_data_schema: dataSchema, _debug_empresa_id: empresaId } : {}),
    };

    return NextResponse.json(successResponse(payload));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
