"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { crearParaLlevar, getMesas, getParaLlevarActivas } from "@/lib/mesas/storage";
import type { EstadoMesa, MesaConResumen, ParaLlevarConResumen } from "@/lib/mesas/types";

function formatGs(v: number) {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}

function formatPL(n: number | null): string {
  return `PL-${String(n ?? 0).padStart(3, "0")}`;
}

interface MesaStyle {
  card: string;
  tile: string;
  pill: string;
  dot: string;
  label: string;
}

const ESTADO_STYLE: Record<EstadoMesa, MesaStyle> = {
  libre:      { card: "border-slate-200 bg-white hover:border-emerald-300",            tile: "bg-emerald-50 text-emerald-600", pill: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500", label: "Libre" },
  ocupada:    { card: "border-amber-200 bg-amber-50/40 hover:border-amber-300",        tile: "bg-amber-100 text-amber-700",    pill: "bg-amber-100 text-amber-800",    dot: "bg-amber-500",   label: "Ocupada" },
  por_cobrar: { card: "border-rose-200 bg-rose-50/50 hover:border-rose-300 ring-1 ring-rose-100", tile: "bg-rose-100 text-rose-700", pill: "bg-rose-100 text-rose-800",   dot: "bg-rose-500",    label: "Por cobrar" },
  cerrada:    { card: "border-slate-200 bg-slate-50 hover:border-slate-300",           tile: "bg-slate-100 text-slate-500",    pill: "bg-slate-100 text-slate-600",    dot: "bg-slate-400",   label: "Cerrada" },
  inactiva:   { card: "border-slate-200 bg-slate-50 opacity-60",                       tile: "bg-slate-100 text-slate-400",    pill: "bg-slate-100 text-slate-500",    dot: "bg-slate-300",   label: "Inactiva" },
};

export default function MesasPage() {
  const router = useRouter();
  const [mesas, setMesas] = useState<MesaConResumen[]>([]);
  const [paraLlevar, setParaLlevar] = useState<ParaLlevarConResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [plModalOpen, setPlModalOpen] = useState(false);
  const [plNombre, setPlNombre] = useState("");
  const [plCreating, setPlCreating] = useState(false);
  const [plError, setPlError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [m, pl] = await Promise.all([getMesas(), getParaLlevarActivas()]);
      if (!cancelled) { setMesas(m); setParaLlevar(pl); setLoading(false); }
    };
    void load();
    const t = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  async function onCrearPL() {
    setPlError(null);
    setPlCreating(true);
    const nombre = plNombre.trim() || null;
    const r = await crearParaLlevar(nombre);
    setPlCreating(false);
    if (!r.success) { setPlError(r.error); return; }
    setPlModalOpen(false);
    setPlNombre("");
    router.push(`/mesas/pl/${r.sesion.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Mesas</h1>
          <p className="text-sm text-slate-500">Tocá una mesa para tomar el pedido.</p>
        </div>
        <button
          type="button"
          onClick={() => { setPlNombre(""); setPlError(null); setPlModalOpen(true); }}
          className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 active:scale-95"
        >
          + Nuevo Para llevar
        </button>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-2 text-xs">
        {(["libre", "ocupada", "por_cobrar"] as EstadoMesa[]).map((e) => (
          <span key={e} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${ESTADO_STYLE[e].pill}`}>
            <span className={`inline-block h-2 w-2 rounded-full ${ESTADO_STYLE[e].dot}`} />
            {ESTADO_STYLE[e].label}
          </span>
        ))}
      </div>

      {loading ? (
        <p className="py-10 text-center text-slate-400">Cargando mesas…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {mesas.map((m) => {
              const st = ESTADO_STYLE[m.mesa.estado];
              const activa = !!m.sesion;
              return (
                <button
                  key={m.mesa.id}
                  type="button"
                  onClick={() => router.push(`/mesas/${m.mesa.id}`)}
                  className={`group flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-3xl border p-5 text-center shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md active:scale-[0.98] ${st.card}`}
                >
                  <div className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-extrabold transition-transform duration-200 group-hover:scale-105 ${st.tile}`}>
                    {m.mesa.numero}
                  </div>
                  <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-slate-400">Mesa</span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.pill}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                    {st.label}
                  </span>
                  {activa ? (
                    <div className="mt-0.5 flex flex-col items-center leading-tight">
                      <span className="text-sm font-bold tabular-nums text-slate-800">{formatGs(m.total)}</span>
                      {m.items_count > 0 && <span className="text-[11px] text-slate-400">{m.items_count} ítem(s)</span>}
                    </div>
                  ) : (
                    <span className="mt-0.5 text-[11px] text-slate-300">Tocá para abrir</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Panel Para llevar (activas) */}
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-indigo-700">Para llevar</span>
              <span className="text-xs text-slate-500">{paraLlevar.length} activo(s)</span>
            </div>
            {paraLlevar.length === 0 ? (
              <p className="py-3 text-center text-sm text-slate-400">No hay pedidos Para llevar activos.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {paraLlevar.map(({ sesion, total, items_count, mozo_nombre }) => (
                  <li key={sesion.id}>
                    <button
                      type="button"
                      onClick={() => router.push(`/mesas/pl/${sesion.id}`)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-white p-3 text-left shadow-sm hover:border-indigo-300 hover:shadow-md active:scale-[0.98]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">{formatPL(sesion.numero_pl)}</span>
                          {sesion.estado === "por_cobrar" && (
                            <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">Por cobrar</span>
                          )}
                        </div>
                        {sesion.nombre_cliente && <p className="truncate text-xs text-slate-500">{sesion.nombre_cliente}</p>}
                        <p className="text-[11px] text-slate-400">
                          {items_count} ítem(s){mozo_nombre ? ` · ${mozo_nombre}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-slate-800">{formatGs(total)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {/* Modal Nuevo Para llevar */}
      {plModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !plCreating && setPlModalOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800">Nuevo Para llevar</h3>
            <p className="mt-1 text-sm text-slate-500">Nombre del cliente (opcional). El correlativo PL se asigna automáticamente.</p>
            <input
              type="text"
              value={plNombre}
              onChange={(e) => setPlNombre(e.target.value)}
              placeholder="Ej. Karen"
              maxLength={120}
              disabled={plCreating}
              autoFocus
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              onKeyDown={(e) => { if (e.key === "Enter") void onCrearPL(); }}
            />
            {plError && <p className="mt-2 text-sm text-red-600">⚠ {plError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={plCreating} onClick={() => setPlModalOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                Cancelar
              </button>
              <button type="button" disabled={plCreating} onClick={onCrearPL}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                {plCreating ? "Creando…" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
