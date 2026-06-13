"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cambiarEstadoComanda, getComandas } from "@/lib/comandas/storage";
import type { ComandaCard, EstadoComanda } from "@/lib/comandas/types";

function formatGs(v: number) {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}
function formatHora(iso: string) {
  try { return new Date(iso).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

const COLUMNAS: { estado: EstadoComanda; titulo: string; color: string }[] = [
  { estado: "enviada", titulo: "Enviadas", color: "border-amber-300 bg-amber-50" },
  { estado: "en_preparacion", titulo: "En preparación", color: "border-sky-300 bg-sky-50" },
  { estado: "lista", titulo: "Listas", color: "border-emerald-300 bg-emerald-50" },
  { estado: "entregada", titulo: "Entregadas", color: "border-slate-300 bg-slate-50" },
];

// Botón de avance por estado.
const AVANCE: Partial<Record<EstadoComanda, { siguiente: EstadoComanda; label: string }>> = {
  enviada: { siguiente: "en_preparacion", label: "Pasar a preparación" },
  en_preparacion: { siguiente: "lista", label: "Marcar lista" },
  lista: { siguiente: "entregada", label: "Marcar entregada" },
};

export default function ComandasPage() {
  const [comandas, setComandas] = useState<ComandaCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await getComandas();
    setComandas(d);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = () => { if (!cancelled) void load(); };
    run();
    const t = setInterval(run, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, [load]);

  async function cambiar(c: ComandaCard, estado: EstadoComanda) {
    if (estado === "cancelada" && !confirm(`¿Cancelar la comanda N°${c.numero} (Mesa ${c.mesa_numero ?? "?"})?`)) return;
    setError(null);
    const prev = comandas;
    // Optimista: mover/actualizar la card al instante.
    setComandas((list) => list.map((x) => (x.id === c.id ? { ...x, estado } : x)));
    const r = await cambiarEstadoComanda(c.id, estado);
    if (!r.success) { setComandas(prev); setError(r.error); }
  }

  const porEstado = useMemo(() => {
    const map = new Map<EstadoComanda, ComandaCard[]>();
    for (const col of COLUMNAS) map.set(col.estado, []);
    for (const c of comandas) {
      if (c.estado === "cancelada") continue; // canceladas fuera del tablero
      (map.get(c.estado) ?? []).push(c);
    }
    return map;
  }, [comandas]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Comandas</h1>
        <p className="text-sm text-slate-500">Tablero de cocina — comandas de las últimas horas. Se actualiza solo.</p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">⚠ {error}</div>}

      {loading ? (
        <p className="py-10 text-center text-slate-400">Cargando comandas…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNAS.map((col) => {
            const lista = porEstado.get(col.estado) ?? [];
            return (
              <div key={col.estado} className="flex flex-col">
                <div className={`mb-3 rounded-lg border px-3 py-2 ${col.color}`}>
                  <h2 className="text-sm font-bold text-slate-700">
                    {col.titulo} <span className="ml-1 rounded-full bg-white/70 px-2 text-xs">{lista.length}</span>
                  </h2>
                </div>
                <div className="space-y-3">
                  {lista.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">Sin comandas</p>
                  ) : (
                    lista.map((c) => {
                      const avance = AVANCE[c.estado];
                      return (
                        <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-800">
                              Comanda N°{c.numero} · Mesa {c.mesa_numero ?? "—"}
                            </span>
                            <span className="text-xs text-slate-400">{formatHora(c.created_at)}</span>
                          </div>
                          <p className="text-xs text-slate-500">Mozo: {c.mozo_nombre ?? "—"}</p>

                          <ul className="mt-2 space-y-1">
                            {c.items.map((it) => (
                              <li key={it.id} className={`text-sm ${it.cancelado ? "text-slate-400 line-through" : "text-slate-800"}`}>
                                <span className="font-semibold">{it.cantidad}×</span> {it.producto_nombre}
                                {it.observacion && <span className="block pl-5 text-xs text-amber-700">— {it.observacion}</span>}
                              </li>
                            ))}
                          </ul>

                          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                            <span className="text-xs text-slate-500">Total</span>
                            <span className="text-sm font-semibold text-slate-800">{formatGs(c.total)}</span>
                          </div>

                          <div className="mt-3 flex flex-col gap-2">
                            {avance && (
                              <button type="button" onClick={() => cambiar(c, avance.siguiente)}
                                className="rounded-lg bg-[#0EA5E9] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#0284C7] active:scale-95">
                                {avance.label}
                              </button>
                            )}
                            {c.estado !== "entregada" && (
                              <button type="button" onClick={() => cambiar(c, "cancelada")}
                                className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50">
                                Cancelar comanda
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
