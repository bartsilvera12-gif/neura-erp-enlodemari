import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { ComandaCard, EstadoComanda } from "./types";

export async function getComandas(estado?: EstadoComanda | null): Promise<ComandaCard[]> {
  try {
    const qs = estado ? `?estado=${encodeURIComponent(estado)}` : "";
    const res = await fetchWithSupabaseSession(`/api/comandas${qs}`, { cache: "no-store" });
    const json = (await res.json()) as { success?: boolean; data?: { comandas: ComandaCard[] }; error?: string };
    if (!res.ok || !json.success) return [];
    return json.data?.comandas ?? [];
  } catch {
    return [];
  }
}

export async function cambiarEstadoComanda(
  id: string,
  estado: EstadoComanda
): Promise<{ success: true; comanda: ComandaCard } | { success: false; error: string }> {
  try {
    const res = await fetchWithSupabaseSession(`/api/comandas/${encodeURIComponent(id)}/estado`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });
    const json = (await res.json()) as { success?: boolean; data?: { comanda: ComandaCard }; error?: string };
    if (!res.ok || !json.success || !json.data) return { success: false, error: json.error ?? `Error (${res.status}).` };
    return { success: true, comanda: json.data.comanda };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error de red." };
  }
}
