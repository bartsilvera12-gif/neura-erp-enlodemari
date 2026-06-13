import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { Comanda, MesaConResumen, MesaDetalle, MesaSesionItem } from "./types";

type Ok<T> = { success: true } & T;
type Err = { success: false; error: string };

async function call<T>(url: string, method: "GET" | "POST" | "PATCH", body?: unknown): Promise<Ok<T> | Err> {
  try {
    const res = await fetchWithSupabaseSession(url, {
      method,
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json()) as { success?: boolean; data?: T; error?: string };
    if (!res.ok || !json.success || !json.data) return { success: false, error: json.error ?? `Error (${res.status}).` };
    return { success: true, ...(json.data as T) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error de red." };
  }
}

export async function getMesas(): Promise<MesaConResumen[]> {
  const r = await call<{ mesas: MesaConResumen[] }>("/api/mesas", "GET");
  return r.success ? r.mesas : [];
}

export async function getMesaDetalle(mesaId: string): Promise<MesaDetalle | null> {
  const r = await call<{ detalle: MesaDetalle }>(`/api/mesas/${encodeURIComponent(mesaId)}`, "GET");
  return r.success ? r.detalle : null;
}

export function agregarItemMesa(mesaId: string, payload: { producto_id: string; cantidad: number; observacion: string | null }) {
  return call<{ item: MesaSesionItem }>(`/api/mesas/${encodeURIComponent(mesaId)}/items`, "POST", payload);
}

export function actualizarItemMesa(itemId: string, payload: { cantidad?: number; observacion?: string | null; cancelar?: boolean }) {
  return call<{ item: MesaSesionItem }>(`/api/mesas/items/${encodeURIComponent(itemId)}`, "PATCH", payload);
}

/** Envía los ítems pendientes a cocina (comanda). La mesa sigue ocupada. */
export function enviarComandaMesa(mesaId: string) {
  return call<{ comanda: Comanda }>(`/api/mesas/${encodeURIComponent(mesaId)}/comanda`, "POST", {});
}

/** Pedir cuenta / enviar a caja para cobrar (la mesa pasa a por_cobrar). */
export function enviarMesaACaja(mesaId: string) {
  return call<{ sesion: unknown }>(`/api/mesas/${encodeURIComponent(mesaId)}/enviar-caja`, "POST", {});
}

export function cancelarCuentaMesa(mesaId: string) {
  return call<{ ok: boolean }>(`/api/mesas/${encodeURIComponent(mesaId)}/cancelar`, "POST", {});
}

export async function getMesasPorCobrar(): Promise<MesaConResumen[]> {
  const r = await call<{ mesas: MesaConResumen[] }>("/api/mesas/por-cobrar", "GET");
  return r.success ? r.mesas : [];
}

export function facturarMesa(sesionId: string, metodoPago: "efectivo" | "tarjeta" | "transferencia") {
  return call<{ ventaId: string; numeroControl: string | null; yaFacturada: boolean }>(
    `/api/mesas/sesiones/${encodeURIComponent(sesionId)}/facturar`,
    "POST",
    { metodo_pago: metodoPago }
  );
}
