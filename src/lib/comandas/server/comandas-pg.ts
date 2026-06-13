import { createServiceRoleClientWithDbSchema } from "@/lib/supabase/empresa-data-schema";
import type { ComandaCard, ComandaItem, EstadoComanda } from "@/lib/comandas/types";

type Sb = ReturnType<typeof createServiceRoleClientWithDbSchema>;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const COMANDA_COLS = "id, numero, estado, created_at, sesion_id, creado_por, printed_at, print_count";

interface ComandaRow {
  id: string;
  numero: number | string;
  estado: string;
  created_at: string;
  sesion_id: string;
  creado_por: string | null;
  printed_at: string | null;
  print_count: number | string | null;
}

/** Ensambla ComandaCard[]: resuelve mesa (vía sesión), mozo (creado_por) e ítems. */
async function armarCards(sb: Sb, empresaId: string, comandas: ComandaRow[]): Promise<ComandaCard[]> {
  if (!comandas.length) return [];
  const comandaIds = comandas.map((c) => c.id);
  const sesionIds = [...new Set(comandas.map((c) => c.sesion_id))];

  const sQ = await sb.from("mesa_sesiones").select("id, mesa_id, mozo_id").eq("empresa_id", empresaId).in("id", sesionIds);
  const sesById = new Map<string, { mesa_id: string; mozo_id: string | null }>();
  for (const s of (sQ.data ?? []) as Array<{ id: string; mesa_id: string; mozo_id: string | null }>) {
    sesById.set(s.id, { mesa_id: s.mesa_id, mozo_id: s.mozo_id });
  }

  const mesaIds = [...new Set([...sesById.values()].map((s) => s.mesa_id))];
  const mesaNum = new Map<string, number>();
  if (mesaIds.length) {
    const mQ = await sb.from("mesas").select("id, numero").eq("empresa_id", empresaId).in("id", mesaIds);
    for (const m of (mQ.data ?? []) as Array<{ id: string; numero: number | string }>) mesaNum.set(m.id, num(m.numero));
  }

  const userIds = [...new Set(comandas.map((c) => c.creado_por).filter(Boolean) as string[])];
  const userNombre = new Map<string, string>();
  if (userIds.length) {
    try {
      const uQ = await sb.from("usuarios").select("id, nombre").in("id", userIds);
      for (const u of (uQ.data ?? []) as Array<{ id: string; nombre: string | null }>) if (u.nombre) userNombre.set(u.id, u.nombre);
    } catch { /* nombres opcionales */ }
  }

  const iQ = await sb
    .from("mesa_sesion_items")
    .select("id, comanda_id, producto_nombre, cantidad, observacion, total, estado")
    .eq("empresa_id", empresaId)
    .in("comanda_id", comandaIds)
    .order("created_at", { ascending: true });
  const itemsByComanda = new Map<string, ComandaItem[]>();
  for (const it of (iQ.data ?? []) as Array<Record<string, unknown>>) {
    const cid = String(it.comanda_id);
    const list = itemsByComanda.get(cid) ?? [];
    list.push({
      id: String(it.id),
      producto_nombre: (it.producto_nombre as string) ?? "",
      cantidad: num(it.cantidad),
      observacion: (it.observacion as string) ?? null,
      total: num(it.total),
      cancelado: it.estado === "cancelado",
    });
    itemsByComanda.set(cid, list);
  }

  return comandas.map((c) => {
    const ses = sesById.get(c.sesion_id);
    const items = itemsByComanda.get(c.id) ?? [];
    const total = items.filter((i) => !i.cancelado).reduce((s, i) => s + i.total, 0);
    return {
      id: c.id,
      numero: num(c.numero),
      estado: c.estado as EstadoComanda,
      created_at: c.created_at,
      mesa_numero: ses ? mesaNum.get(ses.mesa_id) ?? null : null,
      mozo_nombre: c.creado_por ? userNombre.get(c.creado_por) ?? null : null,
      total,
      items,
      printed_at: c.printed_at,
      print_count: num(c.print_count),
    };
  });
}

/** Comandas recientes (últimas `horas`, excluye canceladas) para la pantalla de impresión. */
export async function listarComandasPg(
  schema: string,
  empresaId: string,
  opts?: { estado?: EstadoComanda | null; horas?: number }
): Promise<ComandaCard[]> {
  const sb = createServiceRoleClientWithDbSchema(schema);
  const horas = opts?.horas ?? 24;
  const desde = new Date(Date.now() - horas * 3600 * 1000).toISOString();

  let q = sb
    .from("comandas")
    .select(COMANDA_COLS)
    .eq("empresa_id", empresaId)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(300);
  if (opts?.estado) q = q.eq("estado", opts.estado);
  else q = q.neq("estado", "cancelada");

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return armarCards(sb, empresaId, (data ?? []) as unknown as ComandaRow[]);
}

export async function getComandaDetallePg(
  schema: string,
  empresaId: string,
  comandaId: string
): Promise<ComandaCard | null> {
  const sb = createServiceRoleClientWithDbSchema(schema);
  const q = await sb.from("comandas").select(COMANDA_COLS).eq("empresa_id", empresaId).eq("id", comandaId).maybeSingle();
  if (q.error) throw new Error(q.error.message);
  if (!q.data) return null;
  const cards = await armarCards(sb, empresaId, [q.data as unknown as ComandaRow]);
  return cards[0] ?? null;
}

/**
 * Registra una impresión (o reimpresión): incrementa print_count, marca la
 * comanda como `impresa` y guarda printed_at/printed_by. NO toca mesa, venta,
 * caja ni stock.
 */
export async function registrarImpresionPg(
  schema: string,
  empresaId: string,
  comandaId: string,
  usuarioId: string | null
): Promise<ComandaCard> {
  const sb = createServiceRoleClientWithDbSchema(schema);
  const cur = await sb.from("comandas").select("id, estado, print_count").eq("empresa_id", empresaId).eq("id", comandaId).maybeSingle();
  if (cur.error) throw new Error(cur.error.message);
  if (!cur.data) throw new Error("Comanda no encontrada.");
  const row = cur.data as { estado: string; print_count: number | string | null };
  if (row.estado === "cancelada") throw new Error("La comanda fue cancelada; no se puede imprimir.");

  const upd = await sb
    .from("comandas")
    .update({
      estado: "impresa",
      print_count: num(row.print_count) + 1,
      printed_at: new Date().toISOString(),
      printed_by: usuarioId,
    })
    .eq("empresa_id", empresaId).eq("id", comandaId)
    .select(COMANDA_COLS).single();
  if (upd.error) throw new Error(upd.error.message);
  const cards = await armarCards(sb, empresaId, [upd.data as unknown as ComandaRow]);
  return cards[0];
}

/** Cancela una comanda (ticket). No toca la cuenta de la mesa ni la facturación. */
export async function cancelarComandaPg(
  schema: string,
  empresaId: string,
  comandaId: string,
  usuarioId: string | null
): Promise<ComandaCard> {
  const sb = createServiceRoleClientWithDbSchema(schema);
  const upd = await sb
    .from("comandas")
    .update({ estado: "cancelada", cancelled_at: new Date().toISOString(), cancelled_by: usuarioId })
    .eq("empresa_id", empresaId).eq("id", comandaId)
    .select(COMANDA_COLS).single();
  if (upd.error) throw new Error(upd.error.message);
  const cards = await armarCards(sb, empresaId, [upd.data as unknown as ComandaRow]);
  return cards[0];
}
