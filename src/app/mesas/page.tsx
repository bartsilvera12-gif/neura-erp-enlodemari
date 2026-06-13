"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMesas } from "@/lib/mesas/storage";
import type { EstadoMesa, MesaConResumen } from "@/lib/mesas/types";

function formatGs(v: number) {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}

const ESTADO_STYLE: Record<EstadoMesa, { card: string; chip: string; label: string }> = {
  libre:      { card: "border-emerald-300 bg-emerald-50 hover:bg-emerald-100", chip: "bg-emerald-500 text-white", label: "Libre" },
  ocupada:    { card: "border-amber-300 bg-amber-50 hover:bg-amber-100",       chip: "bg-amber-500 text-white",   label: "Ocupada" },
  por_cobrar: { card: "border-rose-300 bg-rose-50 hover:bg-rose-100",          chip: "bg-rose-500 text-white",    label: "Por cobrar" },
  cerrada:    { card: "border-slate-200 bg-slate-50 hover:bg-slate-100",       chip: "bg-slate-400 text-white",   label: "Cerrada" },
  inactiva:   { card: "border-slate-200 bg-slate-50 opacity-60",               chip: "bg-slate-300 text-slate-700", label: "Inactiva" },
};

export default function MesasPage() {
  const router = useRouter();
  const [mesas, setMesas] = useState<MesaConResumen[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () => getMesas().then((d) => { if (!cancelled) { setMesas(d); setLoading(false); } });
    load();
    const t = setInterval(load, 15000); // refresco suave para el salón
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Mesas</h1>
        <p className="text-sm text-slate-500">Tocá una mesa para tomar el pedido.</p>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-3 text-xs">
        {(["libre", "ocupada", "por_cobrar"] as EstadoMesa[]).map((e) => (
          <span key={e} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded-full ${ESTADO_STYLE[e].chip}`} />
            {ESTADO_STYLE[e].label}
          </span>
        ))}
      </div>

      {loading ? (
        <p className="py-10 text-center text-slate-400">Cargando mesas…</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {mesas.map((m) => {
            const st = ESTADO_STYLE[m.mesa.estado];
            return (
              <button
                key={m.mesa.id}
                type="button"
                onClick={() => router.push(`/mesas/${m.mesa.id}`)}
                className={`flex min-h-[140px] flex-col items-center justify-center rounded-2xl border-2 p-4 text-center shadow-sm transition active:scale-95 ${st.card}`}
              >
                <span className="text-3xl font-extrabold text-slate-800">{m.mesa.numero}</span>
                <span className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">Mesa</span>
                <span className={`mt-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.chip}`}>{st.label}</span>
                {m.sesion && (
                  <span className="mt-2 text-sm font-bold tabular-nums text-slate-700">{formatGs(m.total)}</span>
                )}
                {m.sesion && m.items_count > 0 && (
                  <span className="text-[11px] text-slate-500">{m.items_count} ítem(s)</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
