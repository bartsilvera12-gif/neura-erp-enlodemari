"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { facturarMesa, getMesasPorCobrar } from "@/lib/mesas/storage";
import type { MesaConResumen } from "@/lib/mesas/types";

function formatGs(v: number) { return `Gs. ${Math.round(v).toLocaleString("es-PY")}`; }
function formatHora(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-PY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

type Metodo = "efectivo" | "tarjeta" | "transferencia";

export default function MesasPorCobrarPage() {
  const [mesas, setMesas] = useState<MesaConResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [facturando, setFacturando] = useState<string | null>(null); // sesion_id
  const [metodo, setMetodo] = useState<Metodo>("efectivo");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const refresh = () => getMesasPorCobrar().then((d) => { setMesas(d); setLoading(false); });
  useEffect(() => { refresh(); }, []);

  async function onFacturar(sesionId: string) {
    setError(null); setOkMsg(null);
    const r = await facturarMesa(sesionId, metodo);
    if (!r.success) { setError(r.error); return; }
    setOkMsg(r.yaFacturada ? "La mesa ya estaba facturada." : `Mesa facturada ✓ ${r.numeroControl ?? ""}`);
    setFacturando(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/ventas" className="text-xs text-[#0EA5E9] hover:underline">← Caja</Link>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Mesas por cobrar</h1>
        <p className="mt-0.5 text-xs text-slate-500">Cuentas enviadas por los mozos. Al facturar se crea la venta en la caja abierta.</p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">⚠ {error}</div>}
      {okMsg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">{okMsg}</div>}

      {loading ? (
        <p className="py-10 text-center text-slate-400">Cargando…</p>
      ) : mesas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-slate-400">
          No hay mesas por cobrar.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mesas.map((m) => (
            <div key={m.sesion?.id ?? m.mesa.id} className="flex flex-col rounded-xl border border-rose-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xl font-extrabold text-slate-800">Mesa {m.mesa.numero}</p>
                  <p className="text-xs text-slate-500">Mozo: {m.mozo_nombre ?? "—"}</p>
                </div>
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">Por cobrar</span>
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div className="text-xs text-slate-500">
                  <p>{m.items_count} ítem(s)</p>
                  <p>Abierta: {formatHora(m.sesion?.enviada_caja_at ?? m.sesion?.abierta_at ?? null)}</p>
                </div>
                <p className="text-2xl font-extrabold tabular-nums text-slate-900">{formatGs(m.total)}</p>
              </div>

              {facturando === m.sesion?.id ? (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-medium text-slate-600">Medio de pago</p>
                  <div className="grid grid-cols-3 gap-1">
                    {(["efectivo", "tarjeta", "transferencia"] as Metodo[]).map((mt) => (
                      <button key={mt} type="button" onClick={() => setMetodo(mt)}
                        className={`rounded-md border py-2 text-xs font-medium ${metodo === mt ? "border-[#0EA5E9] bg-[#0EA5E9]/10 text-[#0EA5E9]" : "border-slate-200 bg-white text-slate-600"}`}>
                        {mt === "efectivo" ? "Efectivo" : mt === "tarjeta" ? "Tarjeta" : "Transfer."}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => setFacturando(null)} className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm">Cancelar</button>
                    <button type="button" onClick={() => m.sesion && onFacturar(m.sesion.id)} className="flex-1 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
                      Confirmar venta
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button" onClick={() => { setMetodo("efectivo"); setFacturando(m.sesion?.id ?? null); }}
                  className="mt-4 rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-95"
                >
                  Facturar mesa
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
