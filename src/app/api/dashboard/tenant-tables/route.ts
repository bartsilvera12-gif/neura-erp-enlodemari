import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { ymdInicioFinMesLocal } from "@/lib/fechas/calendario";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import {
  assertAllowedChatDataSchema,
  isLikelyUnexposedTenantChatSchema,
} from "@/lib/supabase/chat-data-schema";

/**
 * Rango temporal opcional para filtrar tablas con columna fecha.
 * Solo se aplica si vienen `?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` válidos.
 * Backward compatible: sin params, el endpoint trae todo el histórico (comportamiento previo).
 */
type DateRange = { desde: string; hasta: string } | null;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateRangeFromQuery(sp: URLSearchParams): DateRange {
  const desde = sp.get("desde")?.trim() ?? "";
  const hasta = sp.get("hasta")?.trim() ?? "";
  if (!desde || !hasta) return null;
  if (!YMD_RE.test(desde) || !YMD_RE.test(hasta)) return null;
  if (desde > hasta) return null;
  return { desde, hasta };
}

/** Suma `days` a una fecha `YYYY-MM-DD` y devuelve el resultado en el mismo formato. */
function ymdPlusDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate()
  ).padStart(2, "0")}`;
}

/**
 * Fallback PG directo para tablas operativas que necesita el dashboard
 * cuando el tenant `erp_*` no esta expuesto en PostgREST.
 * Por ahora solo cubrimos productos y compras (alimentan DashInventario);
 * el resto de modulos (clientes/facturas/etc.) sigue por supabase.from
 * y degrada silenciosamente con query_errors si el schema no esta expuesto.
 */
async function fallbackProductosPg(schemaRaw: string, empresaId: string): Promise<unknown[]> {
  try {
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const pool = getChatPostgresPool();
    if (!pool) return [];
    const t = quoteSchemaTable(schema, "productos");
    const { rows } = await pool.query(
      `SELECT * FROM ${t} WHERE empresa_id = $1::uuid`,
      [empresaId]
    );
    return rows;
  } catch (e) {
    console.error("[dashboard/tenant-tables] fallbackProductosPg", {
      schema: schemaRaw,
      message: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

async function fallbackComprasPg(
  schemaRaw: string,
  empresaId: string,
  range: DateRange
): Promise<unknown[]> {
  try {
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const pool = getChatPostgresPool();
    if (!pool) return [];
    const t = quoteSchemaTable(schema, "compras");
    if (range) {
      const { rows } = await pool.query(
        `SELECT * FROM ${t} WHERE empresa_id = $1::uuid AND fecha >= $2::date AND fecha <= $3::date`,
        [empresaId, range.desde, range.hasta]
      );
      return rows;
    }
    const { rows } = await pool.query(
      `SELECT * FROM ${t} WHERE empresa_id = $1::uuid`,
      [empresaId]
    );
    return rows;
  } catch (e) {
    console.error("[dashboard/tenant-tables] fallbackComprasPg", {
      schema: schemaRaw,
      message: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

async function fallbackVentasPg(
  schemaRaw: string,
  empresaId: string,
  range: DateRange
): Promise<unknown[]> {
  try {
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const pool = getChatPostgresPool();
    if (!pool) return [];
    const t = quoteSchemaTable(schema, "ventas");
    if (range) {
      const { rows } = await pool.query(
        `SELECT * FROM ${t} WHERE empresa_id = $1::uuid AND fecha >= $2::date AND fecha <= $3::date`,
        [empresaId, range.desde, range.hasta]
      );
      return rows;
    }
    const { rows } = await pool.query(
      `SELECT * FROM ${t} WHERE empresa_id = $1::uuid`,
      [empresaId]
    );
    return rows;
  } catch (e) {
    console.error("[dashboard/tenant-tables] fallbackVentasPg", {
      schema: schemaRaw,
      message: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

async function fallbackVentasItemsPg(
  schemaRaw: string,
  empresaId: string,
  ventaIds: string[] | null
): Promise<unknown[]> {
  try {
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const pool = getChatPostgresPool();
    if (!pool) return [];
    const t = quoteSchemaTable(schema, "ventas_items");
    if (ventaIds !== null) {
      if (ventaIds.length === 0) return [];
      const { rows } = await pool.query(
        `SELECT * FROM ${t} WHERE empresa_id = $1::uuid AND venta_id = ANY($2::uuid[])`,
        [empresaId, ventaIds]
      );
      return rows;
    }
    const { rows } = await pool.query(
      `SELECT * FROM ${t} WHERE empresa_id = $1::uuid`,
      [empresaId]
    );
    return rows;
  } catch (e) {
    console.error("[dashboard/tenant-tables] fallbackVentasItemsPg", {
      schema: schemaRaw,
      message: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

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
  | "suscripciones_canceladas"
  | "notas_credito";

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
 *
 * Query params opcionales:
 *  - desde=YYYY-MM-DD&hasta=YYYY-MM-DD : filtra las tablas temporales por rango.
 *    Aplica a: facturas (fecha), pagos (fecha_pago), ventas (fecha), ventas_items (via venta_id),
 *    compras (fecha), gastos (fecha), tipificaciones (fecha).
 *    NO aplica a: clientes, productos, suscripciones (necesarias completas para joins / estado actual).
 *  - Sin params: comportamiento original (sin filtro) — backward compatible.
 *  - debug=1 : incluye _debug_data_schema y _debug_empresa_id en la respuesta.
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
    const { inicioYmd: inicioMes, finYmd: finMes } = ymdInicioFinMesLocal(now);

    const sp = request.nextUrl.searchParams;
    const includeDebug = sp.get("debug") === "1";
    const range = parseDateRangeFromQuery(sp);

    // Resolvemos el schema siempre — lo usamos para fallback PG directo
    // cuando se detecta un tenant no expuesto en PostgREST.
    const dataSchema = await fetchDataSchemaForEmpresaId(empresaId);
    const usarPg = isLikelyUnexposedTenantChatSchema(dataSchema);

    /** Helper: arma una query con o sin filtro de fecha según `range`. */
    const buildFacturasQ = () => {
      const base = supabase.from("facturas").select("*").eq("empresa_id", empresaId);
      return range ? base.gte("fecha", range.desde).lte("fecha", range.hasta) : base;
    };
    const buildPagosQ = () => {
      const base = supabase.from("pagos").select("id, factura_id, monto, fecha_pago").eq("empresa_id", empresaId);
      return range ? base.gte("fecha_pago", range.desde).lte("fecha_pago", range.hasta) : base;
    };
    const buildTipificacionesQ = () => {
      const base = supabase.from("tipificaciones").select("*").eq("empresa_id", empresaId);
      return range ? base.gte("fecha", range.desde).lte("fecha", range.hasta) : base;
    };
    const buildComprasQ = () => {
      const base = supabase.from("compras").select("*").eq("empresa_id", empresaId);
      return range ? base.gte("fecha", range.desde).lte("fecha", range.hasta) : base;
    };
    const buildGastosQ = () => {
      const base = supabase.from("gastos").select("id, monto, fecha").eq("empresa_id", empresaId);
      return range ? base.gte("fecha", range.desde).lte("fecha", range.hasta) : base;
    };

    /**
     * PostgREST corta cada respuesta en 1000 filas. En un POS (p. ej. restaurante)
     * las ventas de varios meses superan de sobra ese tope, así que sin paginar el
     * dashboard subcontaba (o mostraba vacías) las métricas de Ventas: solo llegaban
     * las primeras 1000 filas y las ventas recientes quedaban fuera. Paginamos con
     * `.range()` en bloques de 1000 hasta agotar. Mismo patrón que /api/ventas.
     */
    const PAGE = 1000;

    /** ventas: paginado respetando el filtro de fecha (`range`) + orden estable. */
    const fetchVentasPaged = async (): Promise<{
      data: unknown[];
      error: { message: string } | null;
    }> => {
      // `ventas.fecha` es timestamptz: `<= hasta` (fecha sin hora = medianoche)
      // excluiría las ventas del propio día `hasta` (p. ej. las de HOY → "Ventas del
      // día" en 0). Límite superior exclusivo con 2 días de margen; el cliente
      // (enRango) recorta al día exacto, así que esto solo acota el volumen.
      const hastaExcl = range ? ymdPlusDays(range.hasta, 2) : null;
      const all: unknown[] = [];
      for (let from = 0; ; from += PAGE) {
        let q = supabase.from("ventas").select("*").eq("empresa_id", empresaId);
        if (range && hastaExcl) q = q.gte("fecha", range.desde).lt("fecha", hastaExcl);
        const res = await q.order("fecha", { ascending: false }).range(from, from + PAGE - 1);
        if (res.error) return { data: all, error: res.error };
        const page = (res.data ?? []) as unknown[];
        for (const row of page) all.push(row);
        if (page.length < PAGE) break;
      }
      return { data: all, error: null };
    };

    /**
     * ventas_items no tiene columna fecha propia. Se traen TODOS los items de la
     * empresa paginados y se agrupan por `venta_id` en el cliente (data.ts solo
     * adjunta los items de las ventas cargadas). No se listan los `venta_id` en la
     * URL a propósito: con miles de ventas excedería el límite de longitud del proxy.
     */
    const fetchVentasItemsPaged = async (): Promise<{
      data: unknown[];
      error: { message: string } | null;
    }> => {
      const all: unknown[] = [];
      for (let from = 0; ; from += PAGE) {
        const res = await supabase
          .from("ventas_items")
          .select("*")
          .eq("empresa_id", empresaId)
          .order("venta_id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (res.error) return { data: all, error: res.error };
        const page = (res.data ?? []) as unknown[];
        for (const row of page) all.push(row);
        if (page.length < PAGE) break;
      }
      return { data: all, error: null };
    };

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
      notaCreditoQ,
    ] = await Promise.all([
      /** Sin `.is("deleted_at", null)` en PostgREST: en tenants viejos la columna puede no existir y rompía todo el batch. */
      supabase.from("clientes").select("*").eq("empresa_id", empresaId),
      buildFacturasQ(),
      buildPagosQ(),
      buildTipificacionesQ(),
      supabase.from("productos").select("*").eq("empresa_id", empresaId),
      fetchVentasPaged(),
      fetchVentasItemsPaged(),
      buildComprasQ(),
      buildGastosQ(),
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
      supabase
        .from("nota_credito")
        .select("id, factura_id, monto, estado_erp")
        .eq("empresa_id", empresaId),
    ]);

    const queryErrors: Partial<Record<TableKey, string>> = {};

    // Productos / compras alimentan DashInventario. Si el supabase.from
    // tira Invalid schema (PGRST106) — caso erp_* no expuesto — caemos a PG directo.
    let productosRows = pickRows("productos", productosQ, queryErrors);
    if ((productosRows.length === 0 && queryErrors.productos) || (usarPg && productosRows.length === 0)) {
      productosRows = await fallbackProductosPg(dataSchema, empresaId);
      if (productosRows.length > 0) delete queryErrors.productos;
    }
    let comprasRows = pickRows("compras", comprasQ, queryErrors);
    if ((comprasRows.length === 0 && queryErrors.compras) || (usarPg && comprasRows.length === 0)) {
      comprasRows = await fallbackComprasPg(dataSchema, empresaId, range);
      if (comprasRows.length > 0) delete queryErrors.compras;
    }
    let ventasRows = pickRows("ventas", ventasQ, queryErrors);
    if ((ventasRows.length === 0 && queryErrors.ventas) || (usarPg && ventasRows.length === 0)) {
      ventasRows = await fallbackVentasPg(dataSchema, empresaId, range);
      if (ventasRows.length > 0) delete queryErrors.ventas;
    }

    let ventasItemsRows = pickRows(
      "ventas_items",
      ventasItemsQ as { data: unknown[] | null; error: { message: string } | null },
      queryErrors
    );
    if ((ventasItemsRows.length === 0 && queryErrors.ventas_items) || (usarPg && ventasItemsRows.length === 0)) {
      ventasItemsRows = await fallbackVentasItemsPg(dataSchema, empresaId, null);
      if (ventasItemsRows.length > 0) delete queryErrors.ventas_items;
    }

    const payload = {
      clientes: pickRows("clientes", clientesQ, queryErrors),
      facturas: pickRows("facturas", facturasQ, queryErrors),
      pagos: pickRows("pagos", pagosQ, queryErrors),
      tipificaciones: pickRows("tipificaciones", tipificacionesQ, queryErrors),
      productos: productosRows,
      ventas: ventasRows,
      ventas_items: ventasItemsRows,
      compras: comprasRows,
      gastos: pickRows("gastos", gastosQ, queryErrors),
      suscripciones: pickRows("suscripciones", suscripcionesDashQ, queryErrors),
      clientes_baja_mes: pickRows("clientes_baja_mes", bajasQ, queryErrors),
      suscripciones_canceladas: pickRows("suscripciones_canceladas", suscBajasQ, queryErrors),
      notas_credito: pickRows("notas_credito", notaCreditoQ, queryErrors),
      ...(Object.keys(queryErrors).length > 0 ? { query_errors: queryErrors } : {}),
      ...(includeDebug && dataSchema
        ? {
            _debug_data_schema: dataSchema,
            _debug_empresa_id: empresaId,
            _debug_date_range: range,
          }
        : {}),
    };

    return NextResponse.json(successResponse(payload));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
