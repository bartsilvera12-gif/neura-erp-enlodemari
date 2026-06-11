"use client";

import { useEffect, useMemo, useState } from "react";
import EdgeScrollArea from "@/components/ui/EdgeScrollArea";
import { getHistorialCajas } from "@/lib/caja/storage";
import type { CajaResumen } from "@/lib/caja/types";

function formatGs(v: number | null | undefined) {
  if (v == null) return "—";
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}

function formatFechaHora(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-PY", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function ReportesPage() {
  const [cajas, setCajas] = useState<CajaResumen[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getHistorialCajas().then((data) => {
      if (!cancelled) {
        setCajas(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const abierta = useMemo(() => cajas.find((c) => c.caja.estado === "abierta") ?? null, [cajas]);
  const totales = useMemo(() => {
    return cajas.reduce(
      (acc, c) => {
        acc.vendido += c.total_vendido;
        acc.efectivo += c.total_efectivo;
        acc.transfer += c.total_transferencia;
        acc.tarjeta += c.total_tarjeta;
        return acc;
      },
      { vendido: 0, efectivo: 0, transfer: 0, tarjeta: 0 }
    );
  }, [cajas]);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]" style={{ boxShadow: "0 0 0 3px rgba(79,174,178,0.18)" }} />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Zentra · Operaciones</p>
        </div>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Reportes</h1>
        <p className="mt-0.5 text-xs text-slate-500">Estado de cuenta y arqueo de cajas por turno</p>
      </div>

      {/* ── Card: Estado de Cuenta / Cajas ─────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-[#4FAEB2]/15 sm:p-6">
        <h2 className="text-base font-semibold text-slate-800">Estado de Cuenta / Cajas</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Las ventas se agrupan por turno (apertura/cierre de caja), no por fecha calendario.
        </p>

        {abierta ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Caja abierta · N° {abierta.caja.numero_caja}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Mini label="Apertura" value={formatGs(abierta.caja.monto_apertura)} />
              <Mini label="Total vendido" value={formatGs(abierta.total_vendido)} />
              <Mini label="Efectivo" value={formatGs(abierta.total_efectivo)} />
              <Mini label="Transferencia" value={formatGs(abierta.total_transferencia)} />
              <Mini label="Tarjeta" value={formatGs(abierta.total_tarjeta)} />
              <Mini label="Efectivo esperado" value={formatGs(abierta.efectivo_esperado)} accent />
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-amber-800">
            No hay ninguna caja abierta en este momento.
          </p>
        )}

        {/* Totales acumulados del historial cargado */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Mini label="Vendido (histórico)" value={formatGs(totales.vendido)} />
          <Mini label="Efectivo (histórico)" value={formatGs(totales.efectivo)} />
          <Mini label="Transferencia (hist.)" value={formatGs(totales.transfer)} />
          <Mini label="Tarjeta (histórico)" value={formatGs(totales.tarjeta)} />
        </div>
      </div>

      {/* ── Historial de cajas ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-800">Historial de cajas</h2>
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-400">Cargando…</p>
        ) : cajas.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">Todavía no hay cajas registradas.</p>
        ) : (
          <EdgeScrollArea>
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-3 py-2.5">N°</th>
                  <th className="px-3 py-2.5">Estado</th>
                  <th className="px-3 py-2.5">Apertura</th>
                  <th className="px-3 py-2.5">Cierre</th>
                  <th className="px-3 py-2.5 text-right">Apertura</th>
                  <th className="px-3 py-2.5 text-right">Vendido</th>
                  <th className="px-3 py-2.5 text-right">Efectivo</th>
                  <th className="px-3 py-2.5 text-right">Transfer.</th>
                  <th className="px-3 py-2.5 text-right">Tarjeta</th>
                  <th className="px-3 py-2.5 text-right">Esperado</th>
                  <th className="px-3 py-2.5 text-right">Contado</th>
                  <th className="px-3 py-2.5 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {cajas.map((c) => {
                  const dif = c.caja.diferencia;
                  return (
                    <tr key={c.caja.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-3 py-2.5 font-medium tabular-nums">{c.caja.numero_caja}</td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          c.caja.estado === "abierta" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                        }`}>
                          {c.caja.estado === "abierta" ? "Abierta" : "Cerrada"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">
                        {formatFechaHora(c.caja.fecha_apertura)}
                        <span className="block text-[11px] text-slate-400">{c.abierta_por_nombre ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">
                        {formatFechaHora(c.caja.fecha_cierre)}
                        <span className="block text-[11px] text-slate-400">{c.cerrada_por_nombre ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatGs(c.caja.monto_apertura)}</td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatGs(c.total_vendido)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatGs(c.total_efectivo)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatGs(c.total_transferencia)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatGs(c.total_tarjeta)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatGs(c.caja.monto_esperado_efectivo ?? (c.caja.estado === "abierta" ? c.efectivo_esperado : null))}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatGs(c.caja.monto_cierre_contado)}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${
                        dif == null ? "text-slate-400" : dif === 0 ? "text-emerald-600" : dif > 0 ? "text-sky-600" : "text-red-600"
                      }`}>
                        {dif == null ? "—" : formatGs(dif)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </EdgeScrollArea>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${accent ? "border-emerald-300 bg-emerald-100/60" : "border-slate-200 bg-white"}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}
