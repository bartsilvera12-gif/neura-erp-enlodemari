import "server-only";

import type { AppSupabaseClient } from "@/lib/supabase/schema";
import type { EnsureSorteoOrderCreatedData } from "@/lib/sorteos/sorteo-order-from-chat";

export async function buildOrderResultFromEntradaId(
  sb: AppSupabaseClient,
  entradaId: string
): Promise<EnsureSorteoOrderCreatedData | null> {
  const { data: ent, error: e1 } = await sb
    .from("sorteo_entradas")
    .select(
      "id, sorteo_id, empresa_id, numero_orden, cantidad_boletos, monto_total, nombre_participante, documento, whatsapp_numero"
    )
    .eq("id", entradaId)
    .maybeSingle();
  if (e1 || !ent) return null;

  const { data: sorteo } = await sb
    .from("sorteos")
    .select("nombre")
    .eq("id", (ent as { sorteo_id: string }).sorteo_id)
    .maybeSingle();

  const { data: cups } = await sb
    .from("sorteo_cupones")
    .select("id, numero_cupon")
    .eq("entrada_id", entradaId);

  const cupones = ((cups ?? []) as { id: string; numero_cupon: string }[]).map((c) => ({
    id: c.id,
    numero_cupon: c.numero_cupon,
  }));

  const enc = ent as {
    sorteo_id: string;
    empresa_id: string;
    numero_orden: number;
    cantidad_boletos: number;
    monto_total: number;
    nombre_participante: string;
    documento?: string | null;
    whatsapp_numero: string;
  };

  return {
    idempotent: true,
    entradaId,
    numeroOrden: Number(enc.numero_orden),
    cupones,
    sorteoId: enc.sorteo_id,
    sorteoNombre: String((sorteo as { nombre?: string } | null)?.nombre ?? ""),
    cantidadBoletos: enc.cantidad_boletos,
    montoTotal: Number(enc.monto_total),
    promoNombre: "",
    precioFuente: "lista",
  };
}

export async function flowDataStubFromEntrada(
  sb: AppSupabaseClient,
  entradaId: string
): Promise<Record<string, string>> {
  const { data: ent } = await sb
    .from("sorteo_entradas")
    .select("nombre_participante, documento, whatsapp_numero")
    .eq("id", entradaId)
    .maybeSingle();
  const r = ent as { nombre_participante?: string; documento?: string | null; whatsapp_numero?: string } | null;
  return {
    nombre_completo: (r?.nombre_participante ?? "").trim(),
    documento: (r?.documento ?? "").trim(),
    telefono: (r?.whatsapp_numero ?? "").trim(),
    celular: (r?.whatsapp_numero ?? "").trim(),
  };
}
