"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { comandaPrintUrl, imprimirComanda } from "@/lib/comandas/storage";
import type { ComandaCard } from "@/lib/comandas/types";
import { SectorBadge } from "@/components/comandas/SectorBadge";

function formatPL(n: number | null | undefined): string {
  return `PL-${String(n ?? 0).padStart(3, "0")}`;
}
function formatHora(iso: string | null) {
  if (!iso) return "—";
  try {
    // Paraguay UTC-3 fija (tzdata del contenedor puede estar stale).
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const s = new Date(d.getTime() - 3 * 60 * 60 * 1000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(s.getUTCDate())}/${p(s.getUTCMonth() + 1)} ${p(s.getUTCHours())}:${p(s.getUTCMinutes())}`;
  } catch { return iso; }
}

async function fetchPedidosPL(estado?: string): Promise<ComandaCard[]> {
  try {
    const qs = estado ? `?estado=${encodeURIComponent(estado)}` : "";
    const res = await fetchWithSupabaseSession(`/api/pedidos-para-llevar${qs}`, { cache: "no-store" });
    const json = (await res.json()) as { success?: boolean; data?: { comandas: ComandaCard[] }; error?: string };
    if (!res.ok || !json.success) return [];
    return json.data?.comandas ?? [];
  } catch { return []; }
}

export default function PedidosParaLlevarPage() {
  const [pendientes, setPendientes] = useState<ComandaCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const pend = await fetchPedidosPL("generada");
    setPendientes(pend);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = () => { if (!cancelled) void load(); };
    run();
    const t = setInterval(run, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, [load]);

  async function onImprimir(c: ComandaCard) {
    setError(null); setBusy(c.id);
    // Pre-abrimos la pestaña con el gesto del usuario, después la apuntamos.
    const w = window.open("about:blank", "_blank");
    const r = await imprimirComanda(c.id);
    setBusy(null);
    if (!r.success) { try { w?.close(); } catch { /* ignore */ } setError(r.error); return; }
    const href = comandaPrintUrl(c.id);
    try { if (w) w.location.href = href; else window.open(href, "_blank", "noopener"); } catch { /* ignore */ }
    void load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Pedidos para llevar</h1>
        <p className="text-sm text-slate-500">Comandas de pedidos con retiro en mostrador. Se refresca cada 15s.</p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">⚠ {error}</div>}

      {loading ? (
        <p className="py-10 text-center text-slate-400">Cargando…</p>
      ) : pendientes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <p className="text-slate-400">No hay pedidos para llevar pendientes.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pendientes.map((c) => {
            const items = c.items.filter((i) => !i.cancelado);
            return (
              <li key={c.id} className="flex flex-col justify-between rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-800">Para llevar</span>
                        <span className="font-bold tabular-nums text-slate-800">{formatPL(c.numero_pl)}</span>
                      </div>
                      {c.nombre_cliente && <p className="mt-0.5 text-sm text-slate-600">{c.nombre_cliente}</p>}
                      <p className="text-xs text-slate-400">
                        N°{c.numero} · {formatHora(c.created_at)}
                        {c.mozo_nombre ? ` · ${c.mozo_nombre}` : ""}
                      </p>
                    </div>
                    {c.sector && <SectorBadge sector={c.sector} />}
                  </div>

                  <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2">
                    {items.map((it) => (
                      <li key={it.id} className="text-sm text-slate-800">
                        <span className="font-semibold">{it.cantidad}×</span> {it.producto_nombre}
                        {it.es_mitad_mitad && it.mitad_1_nombre && it.mitad_2_nombre && (
                          <span className="block pl-5 text-xs text-amber-700">½ {it.mitad_1_nombre} + ½ {it.mitad_2_nombre}</span>
                        )}
                        {it.observacion && <span className="block pl-5 text-xs text-amber-700">— {it.observacion}</span>}
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => onImprimir(c)}
                  disabled={busy === c.id}
                  className="mt-4 w-full rounded-xl bg-indigo-600 px-5 py-3 text-base font-semibold text-white shadow-sm hover:bg-indigo-700 active:scale-95 disabled:opacity-50"
                >
                  {busy === c.id ? "Imprimiendo…" : "Imprimir"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
