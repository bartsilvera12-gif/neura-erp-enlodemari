"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import MesaProductPicker from "@/components/mesas/MesaProductPicker";
import { facturarMesa, getMesasPorCobrar, type PagoConciliacionInput } from "@/lib/mesas/storage";
import { actualizarItemCaja, agregarItemCaja, getSesionPorCobrar } from "@/lib/ventas/por-cobrar";
import { getCuentasBancarias } from "@/lib/conciliacion/storage";
import type { MesaConResumen, MesaDetalle } from "@/lib/mesas/types";
import type { CuentaBancaria } from "@/lib/conciliacion/types";

function formatGs(v: number) { return `Gs. ${Math.round(v).toLocaleString("es-PY")}`; }
type Metodo = "efectivo" | "tarjeta" | "transferencia";

export default function MesasPorCobrarPage() {
  const [mesas, setMesas] = useState<MesaConResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [facturada, setFacturada] = useState<{ ventaId: string; numero: string | null; mesa: number | null } | null>(null);

  const refresh = () => getMesasPorCobrar().then((d) => { setMesas(d); setLoading(false); });
  useEffect(() => { refresh(); getCuentasBancarias().then(setCuentas); }, []);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/ventas" className="text-xs text-[#0EA5E9] hover:underline">← Caja</Link>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Mesas por cobrar</h1>
        <p className="mt-0.5 text-xs text-slate-500">Podés ajustar la cuenta antes de cobrar. Al facturar se crea la venta en la caja abierta.</p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">⚠ {error}</div>}

      {facturada && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-800">Mesa {facturada.mesa ?? ""} facturada ✓ {facturada.numero ?? ""}</p>
          <div className="flex gap-2">
            <a href={`/api/ventas/${facturada.ventaId}/ticket?copia=cliente&auto=1`} target="_blank" rel="noopener"
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">Imprimir ticket</a>
            <Link href="/ventas" className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100">Ver ventas</Link>
            <button onClick={() => setFacturada(null)} className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100">Cerrar</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-slate-400">Cargando…</p>
      ) : mesas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-slate-400">No hay mesas por cobrar.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {mesas.map((m) => m.sesion && (
            <MesaCard key={m.sesion.id} m={m} cuentas={cuentas}
              onError={setError}
              onFacturada={(r, mesaNum) => { setFacturada({ ...r, mesa: mesaNum }); refresh(); }}
              onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

function MesaCard({ m, cuentas, onError, onFacturada, onChanged }: {
  m: MesaConResumen; cuentas: CuentaBancaria[];
  onError: (s: string | null) => void;
  onFacturada: (r: { ventaId: string; numero: string | null }, mesaNum: number | null) => void;
  onChanged: () => void;
}) {
  const sesionId = m.sesion!.id;
  const [modo, setModo] = useState<null | "editar" | "facturar">(null);
  const [detalle, setDetalle] = useState<MesaDetalle | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [metodo, setMetodo] = useState<Metodo>("efectivo");
  const [pago, setPago] = useState<PagoConciliacionInput>({});
  const [busy, setBusy] = useState(false);

  const total = detalle ? detalle.total : m.total;

  async function abrirEditar() {
    setModo("editar"); onError(null);
    setDetalle(await getSesionPorCobrar(sesionId));
  }
  async function recargar() { setDetalle(await getSesionPorCobrar(sesionId)); onChanged(); }

  async function onAdd(prod: { id: string }, cantidad: number, observacion: string | null): Promise<boolean> {
    const r = await agregarItemCaja(sesionId, { producto_id: prod.id, cantidad, observacion });
    if (!r.success) { onError(r.error); return false; }
    await recargar();
    return true;
  }
  async function changeQty(itemId: string, nueva: number) {
    if (nueva < 1) return;
    const r = await actualizarItemCaja(itemId, { cantidad: nueva });
    if (!r.success) { onError(r.error); return; }
    await recargar();
  }
  async function cancelItem(itemId: string) {
    const r = await actualizarItemCaja(itemId, { cancelar: true });
    if (!r.success) { onError(r.error); return; }
    await recargar();
  }

  async function facturar() {
    onError(null); setBusy(true);
    const necesitaPago = metodo === "tarjeta" || metodo === "transferencia";
    const r = await facturarMesa(sesionId, metodo, necesitaPago ? { ...pago, fecha_pago: pago.fecha_pago || new Date().toISOString() } : null);
    setBusy(false);
    if (!r.success) { onError(r.error); return; }
    onFacturada({ ventaId: r.ventaId, numero: r.numeroControl }, m.mesa.numero);
  }

  return (
    <div className="rounded-xl border border-rose-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xl font-extrabold text-slate-800">Mesa {m.mesa.numero}</p>
          <p className="text-xs text-slate-500">Mozo: {m.mozo_nombre ?? "—"} · {detalle?.items.length ?? m.items_count} ítem(s)</p>
        </div>
        <p className="text-2xl font-extrabold tabular-nums text-slate-900">{formatGs(total)}</p>
      </div>

      {modo === "editar" && detalle && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <ul className="divide-y divide-slate-200">
            {detalle.items.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{it.producto_nombre}{it.observacion ? ` · ${it.observacion}` : ""}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => changeQty(it.id, it.cantidad - 1)} className="h-7 w-7 rounded border border-slate-300 text-sm font-bold">−</button>
                  <span className="w-6 text-center text-sm tabular-nums">{it.cantidad}</span>
                  <button onClick={() => changeQty(it.id, it.cantidad + 1)} className="h-7 w-7 rounded border border-slate-300 text-sm font-bold">+</button>
                  <button onClick={() => cancelItem(it.id)} className="ml-1 text-xs text-red-400 hover:text-red-600">✕</button>
                </div>
              </li>
            ))}
          </ul>
          <button onClick={() => setPickerOpen(true)} className="mt-2 w-full rounded-lg bg-[#0EA5E9] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#0284C7]">+ Agregar productos</button>
        </div>
      )}

      {modo === "facturar" && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-medium text-slate-600">Medio de pago</p>
          <div className="grid grid-cols-3 gap-1">
            {(["efectivo", "tarjeta", "transferencia"] as Metodo[]).map((mt) => (
              <button key={mt} onClick={() => setMetodo(mt)}
                className={`rounded-md border py-2 text-xs font-medium ${metodo === mt ? "border-[#0EA5E9] bg-[#0EA5E9]/10 text-[#0EA5E9]" : "border-slate-200 bg-white text-slate-600"}`}>
                {mt === "efectivo" ? "Efectivo" : mt === "tarjeta" ? "Tarjeta" : "Transfer."}
              </button>
            ))}
          </div>

          {metodo === "transferencia" && (
            <div className="mt-3 space-y-2">
              {cuentas.length > 0 && (
                <select value={pago.cuenta_bancaria_id ?? ""} onChange={(e) => setPago((p) => ({ ...p, cuenta_bancaria_id: e.target.value || null }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="">Cuenta destino…</option>
                  {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.banco ? ` (${c.banco})` : ""}</option>)}
                </select>
              )}
              <input value={pago.entidad ?? ""} onChange={(e) => setPago((p) => ({ ...p, entidad: e.target.value }))} placeholder="Banco / entidad" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input value={pago.referencia ?? ""} onChange={(e) => setPago((p) => ({ ...p, referencia: e.target.value }))} placeholder="Referencia / N° comprobante" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input value={pago.observacion ?? ""} onChange={(e) => setPago((p) => ({ ...p, observacion: e.target.value }))} placeholder="Observación (opcional)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
          )}
          {metodo === "tarjeta" && (
            <div className="mt-3 space-y-2">
              {cuentas.length > 0 && (
                <select value={pago.cuenta_bancaria_id ?? ""} onChange={(e) => setPago((p) => ({ ...p, cuenta_bancaria_id: e.target.value || null }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="">POS / entidad…</option>
                  {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.tipo ? ` (${c.tipo})` : ""}</option>)}
                </select>
              )}
              <input value={pago.entidad ?? ""} onChange={(e) => setPago((p) => ({ ...p, entidad: e.target.value }))} placeholder="POS / entidad (texto libre)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-1">
                {["debito", "credito"].map((t) => (
                  <button key={t} onClick={() => setPago((p) => ({ ...p, tipo_tarjeta: t }))}
                    className={`rounded-md border py-2 text-xs font-medium ${pago.tipo_tarjeta === t ? "border-[#0EA5E9] bg-[#0EA5E9]/10 text-[#0EA5E9]" : "border-slate-200 bg-white text-slate-600"}`}>
                    {t === "debito" ? "Débito" : "Crédito"}
                  </button>
                ))}
              </div>
              <input value={pago.referencia ?? ""} onChange={(e) => setPago((p) => ({ ...p, referencia: e.target.value }))} placeholder="Voucher / N° autorización" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input value={pago.observacion ?? ""} onChange={(e) => setPago((p) => ({ ...p, observacion: e.target.value }))} placeholder="Observación (opcional)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
          )}
          {(metodo === "tarjeta" || metodo === "transferencia") && (
            <p className="mt-2 text-[11px] text-slate-400">Queda como conciliación <strong>pendiente</strong>. No suma al efectivo esperado.</p>
          )}
          <button onClick={facturar} disabled={busy} className="mt-3 w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy ? "Facturando…" : "Confirmar venta"}
          </button>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button onClick={() => (modo === "editar" ? setModo(null) : abrirEditar())}
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          {modo === "editar" ? "Listo" : "Editar cuenta"}
        </button>
        <button onClick={() => setModo(modo === "facturar" ? null : "facturar")}
          className="flex-1 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
          {modo === "facturar" ? "Cerrar" : "Facturar mesa"}
        </button>
      </div>

      <MesaProductPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onAdd={onAdd} />
    </div>
  );
}
