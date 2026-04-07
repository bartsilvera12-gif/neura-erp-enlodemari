/**
 * Emisión de factura de suscripción desde rutas API (sin localStorage / getCurrentUser).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { montosFacturaItemParaInsert } from "./factura-item-montos";
import { emitEvent, EVENT_TYPES } from "@/lib/integrations/events";

export async function obtenerSiguienteNumeroFacturaEmpresa(
  supabase: SupabaseClient,
  empresaId: string
): Promise<string> {
  const prefijo = process.env.FACTURA_PREFIJO ?? "FAC-";
  const { data } = await supabase
    .from("facturas")
    .select("numero_factura")
    .eq("empresa_id", empresaId)
    .order("numero_factura", { ascending: false })
    .limit(1)
    .maybeSingle();

  let next = 1;
  if (data?.numero_factura) {
    const match = String(data.numero_factura).match(/(\d+)$/);
    if (match) next = parseInt(match[1], 10) + 1;
  }
  return `${prefijo}${String(next).padStart(6, "0")}`;
}

export type SuscripcionFacturaRow = {
  id: string;
  cliente_id: string;
  plan_id: string | null;
  precio: number;
  moneda: string;
  dia_facturacion?: number | null;
  dia_vencimiento?: number | null;
};

/**
 * Si no hay factura del mes calendario actual para esa suscripción, crea una (equivalente a emitir este mes).
 */
export async function crearFacturaInicialSuscripcionSiCorresponde(opts: {
  supabase: SupabaseClient;
  empresaId: string;
  suscripcion: SuscripcionFacturaRow;
}): Promise<void> {
  const { supabase, empresaId, suscripcion } = opts;
  const hoy = new Date().toISOString().slice(0, 10);
  const y = new Date().getFullYear();
  const m = new Date().getMonth() + 1;
  const mesActual = `${y}-${String(m).padStart(2, "0")}`;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const mesSiguiente = `${nextY}-${String(nextM).padStart(2, "0")}`;

  const { data: existentes } = await supabase
    .from("facturas")
    .select("id")
    .eq("cliente_id", suscripcion.cliente_id)
    .eq("suscripcion_id", suscripcion.id)
    .eq("empresa_id", empresaId)
    .gte("fecha", `${mesActual}-01`)
    .lt("fecha", `${mesSiguiente}-01`)
    .limit(1);

  if (existentes && existentes.length > 0) return;

  const monto = Number(suscripcion.precio);
  if (!Number.isFinite(monto) || monto <= 0) return;

  const numeroFactura = await obtenerSiguienteNumeroFacturaEmpresa(supabase, empresaId);
  const moneda = suscripcion.moneda === "USD" ? "USD" : "GS";
  const diaVenc = Math.min(Number(suscripcion.dia_vencimiento) || 10, 28);
  const venc = new Date();
  venc.setMonth(venc.getMonth() + 1);
  venc.setDate(diaVenc);
  const fechaVenc = venc.toISOString().slice(0, 10);

  const { data: factura, error: errFact } = await supabase
    .from("facturas")
    .insert({
      empresa_id: empresaId,
      cliente_id: suscripcion.cliente_id,
      suscripcion_id: suscripcion.id,
      numero_factura: numeroFactura,
      fecha: hoy,
      fecha_vencimiento: fechaVenc,
      monto,
      saldo: monto,
      estado: "Pendiente",
      tipo: "suscripcion",
      moneda,
    })
    .select()
    .single();

  if (errFact || !factura) {
    console.error("[crearFacturaInicialSuscripcionSiCorresponde]", errFact?.message);
    return;
  }

  let planNombre = "Suscripción";
  if (suscripcion.plan_id) {
    const { data: plan } = await supabase.from("planes").select("nombre").eq("id", suscripcion.plan_id).single();
    if (plan?.nombre) planNombre = plan.nombre;
  }

  const linea = montosFacturaItemParaInsert({
    totalLinea: monto,
    moneda,
    cantidad: 1,
    precioUnitario: monto,
  });

  const { error: errItem } = await supabase.from("factura_items").insert({
    factura_id: factura.id,
    empresa_id: empresaId,
    descripcion: planNombre,
    cantidad: 1,
    precio_unitario: linea.precio_unitario,
    subtotal: linea.subtotal,
    iva: linea.iva,
    total: linea.total,
  });

  if (errItem) {
    console.error("[crearFacturaInicialSuscripcionSiCorresponde] factura_items:", errItem.message);
  }

  await emitEvent(EVENT_TYPES.factura_creada, {
    factura_id: factura.id,
    cliente_id: suscripcion.cliente_id,
    monto: (factura as { monto: number }).monto,
  });
}
