"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MesaProductPicker from "@/components/mesas/MesaProductPicker";
import {
  agregarItemMesa, cancelarCuentaMesa, enviarMesaACaja, getMesaDetalle,
} from "@/lib/mesas/storage";
import type { MesaDetalle } from "@/lib/mesas/types";

function formatGs(v: number) {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}

export default function MesaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [det, setDet] = useState<MesaDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const d = await getMesaDetalle(id);
    setDet(d);
    setLoading(false);
  }, [id]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (loading) return <p className="py-10 text-center text-slate-400">Cargando mesa…</p>;
  if (!det) return (
    <div className="space-y-3">
      <button onClick={() => router.push("/mesas")} className="text-sm text-[#0EA5E9]">← Mesas</button>
      <p className="text-slate-500">Mesa no encontrada.</p>
    </div>
  );

  const { mesa, sesion, items, total } = det;
  const porCobrar = sesion?.estado === "por_cobrar";
  const tieneItems = items.length > 0;

  async function onAdd(productoId: string, cantidad: number, observacion: string | null): Promise<boolean> {
    setError(null);
    const r = await agregarItemMesa(id, { producto_id: productoId, cantidad, observacion });
    if (!r.success) { setError(r.error); return false; }
    await refresh();
    return true;
  }

  async function onEnviarCaja() {
    setBusy(true); setError(null);
    const r = await enviarMesaACaja(id);
    setBusy(false);
    if (!r.success) { setError(r.error); return; }
    router.push("/mesas");
  }

  async function onCancelar() {
    if (!confirm(`¿Cancelar la cuenta de la mesa ${mesa.numero}? Esto no factura ni cobra nada.`)) return;
    setBusy(true); setError(null);
    const r = await cancelarCuentaMesa(id);
    setBusy(false);
    if (!r.success) { setError(r.error); return; }
    router.push("/mesas");
  }

  return (
    <div className="space-y-5 pb-28">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => router.push("/mesas")} className="text-sm text-[#0EA5E9]">← Mesas</button>
          <h1 className="text-2xl font-bold text-slate-800">
            Mesa {mesa.numero}
            <span className={`ml-2 align-middle rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              mesa.estado === "libre" ? "bg-emerald-100 text-emerald-700"
              : mesa.estado === "ocupada" ? "bg-amber-100 text-amber-700"
              : mesa.estado === "por_cobrar" ? "bg-rose-100 text-rose-700"
              : "bg-slate-100 text-slate-600"}`}>
              {mesa.estado === "por_cobrar" ? "Por cobrar" : mesa.estado.charAt(0).toUpperCase() + mesa.estado.slice(1)}
            </span>
          </h1>
        </div>
      </div>

      {porCobrar && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">
          Esta cuenta fue enviada a caja. La cobra/factura el cajero.
        </div>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">⚠ {error}</div>}

      {/* Lista de productos */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Pedido</h2>
        {!tieneItems ? (
          <p className="py-8 text-center text-slate-400">Todavía no agregaste productos.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800">
                    <span className="mr-1.5 inline-block min-w-[28px] rounded bg-slate-100 px-1.5 text-center text-sm font-bold">{it.cantidad}×</span>
                    {it.producto_nombre}
                  </p>
                  {it.observacion && <p className="ml-9 text-xs text-amber-700">— {it.observacion}</p>}
                  <p className="ml-9 text-xs text-slate-400">{formatGs(it.precio_unitario)} c/u</p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums text-slate-800">{formatGs(it.total)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
          <span className="text-base font-bold text-slate-900">TOTAL</span>
          <span className="text-xl font-extrabold tabular-nums text-slate-900">{formatGs(total)}</span>
        </div>
      </div>

      {/* Acciones grandes (sticky abajo) */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row">
          {!porCobrar && (
            <button
              type="button" onClick={() => setPickerOpen(true)}
              className="flex-1 rounded-xl bg-[#0EA5E9] px-5 py-4 text-base font-semibold text-white shadow-sm hover:bg-[#0284C7] active:scale-95"
            >
              + Agregar productos
            </button>
          )}
          {!porCobrar && tieneItems && (
            <button
              type="button" onClick={onEnviarCaja} disabled={busy}
              className="flex-1 rounded-xl bg-emerald-600 px-5 py-4 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
            >
              Enviar a caja
            </button>
          )}
          {sesion && !sesion.venta_id && (
            <button
              type="button" onClick={onCancelar} disabled={busy}
              className="rounded-xl border border-rose-300 px-5 py-4 text-base font-semibold text-rose-600 hover:bg-rose-50 active:scale-95 disabled:opacity-50"
            >
              Cancelar cuenta
            </button>
          )}
        </div>
      </div>

      <MesaProductPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onAdd={onAdd} />
    </div>
  );
}
