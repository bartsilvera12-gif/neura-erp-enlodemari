"use client";

import { useCallback, useEffect, useState } from "react";
import MontoInput from "@/components/ui/MontoInput";
import {
  abrirCaja,
  cerrarCaja,
  getCajaAbierta,
  getResumenCaja,
  registrarMovimiento,
} from "@/lib/caja/storage";
import type { Caja, CajaResumen, MedioPagoCaja, TipoMovimientoCaja } from "@/lib/caja/types";

function formatGs(v: number) {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}

function formatFechaHora(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-PY", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const inputClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#0EA5E9] bg-white text-sm";

type ModalKind = null | "abrir" | "cerrar" | "mov";

export default function CajaControlPanel({
  onStateChange,
}: {
  /** Notifica al padre si hay (o no) caja abierta, para habilitar/bloquear ventas. */
  onStateChange?: (abierta: boolean) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [caja, setCaja] = useState<Caja | null>(null);
  const [resumen, setResumen] = useState<CajaResumen | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const c = await getCajaAbierta();
    setCaja(c);
    onStateChange?.(!!c);
    setResumen(c ? await getResumenCaja(c.id) : null);
    setLoading(false);
  }, [onStateChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading && !caja) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400 shadow-sm">
        Cargando estado de caja…
      </div>
    );
  }

  return (
    <>
      {caja ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Caja abierta · N° {caja.numero_caja}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Apertura: <strong>{formatFechaHora(caja.fecha_apertura)}</strong> · Monto inicial{" "}
                <strong>{formatGs(caja.monto_apertura)}</strong>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setModal("mov")}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Movimiento de caja
              </button>
              <button
                type="button"
                onClick={() => setModal("cerrar")}
                className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-rose-700"
              >
                Cerrar caja
              </button>
            </div>
          </div>

          {resumen && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Total vendido" value={formatGs(resumen.total_vendido)} sub={`${resumen.cantidad_ventas} venta(s)`} />
              <Stat label="Efectivo" value={formatGs(resumen.total_efectivo)} />
              <Stat label="Transferencia" value={formatGs(resumen.total_transferencia)} />
              <Stat label="Tarjeta" value={formatGs(resumen.total_tarjeta)} />
              <Stat
                label="Debería haber en caja"
                value={formatGs(resumen.efectivo_esperado)}
                sub="apertura + efectivo ± mov."
                accent
              />
              <Stat label="Ingresos efvo." value={formatGs(resumen.ingresos_efectivo)} />
              <Stat label="Egresos efvo." value={formatGs(resumen.egresos_efectivo)} />
              <Stat label="Retiros efvo." value={formatGs(resumen.retiros_efectivo)} />
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                  Caja cerrada
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Para vender primero tenés que <strong>abrir caja</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setModal("abrir")}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
            >
              Abrir caja
            </button>
          </div>
        </div>
      )}

      {modal === "abrir" && (
        <AbrirCajaModal onClose={() => setModal(null)} onDone={() => { setModal(null); void refresh(); }} />
      )}
      {modal === "cerrar" && caja && resumen && (
        <CerrarCajaModal
          caja={caja}
          resumen={resumen}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); void refresh(); }}
        />
      )}
      {modal === "mov" && caja && (
        <MovimientoModal onClose={() => setModal(null)} onDone={() => { setModal(null); void refresh(); }} />
      )}
    </>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${accent ? "border-emerald-300 bg-emerald-100/60" : "border-slate-200 bg-white"}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}

// ── Modal shell ────────────────────────────────────────────────────────────────

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-slate-900/60 px-3 pt-12 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-md flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700" title="Cerrar (Esc)">✕</button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
      ⚠ {msg}
    </div>
  );
}

// ── Abrir ────────────────────────────────────────────────────────────────────

function AbrirCajaModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [monto, setMonto] = useState("");
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    setSaving(true);
    const r = await abrirCaja(parseFloat(monto) || 0, obs.trim() || null);
    setSaving(false);
    if (!r.success) { setError(r.error); return; }
    onDone();
  }

  return (
    <ModalShell title="Abrir caja" onClose={onClose}>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">Monto de apertura (Gs.)</label>
      <MontoInput value={monto} onChange={(n) => setMonto(String(n))} placeholder="Ej: 300.000" className={inputClass} decimals={false} />
      <label className="mb-1.5 mt-3 block text-sm font-medium text-slate-700">Observación (opcional)</label>
      <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className={inputClass} placeholder="Ej: turno noche" />
      <ErrorBanner msg={error} />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">Cancelar</button>
        <button type="button" onClick={submit} disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {saving ? "Abriendo…" : "Abrir caja"}
        </button>
      </div>
    </ModalShell>
  );
}

// ── Cerrar ───────────────────────────────────────────────────────────────────

function CerrarCajaModal({
  caja, resumen, onClose, onDone,
}: { caja: Caja; resumen: CajaResumen; onClose: () => void; onDone: () => void }) {
  const [monto, setMonto] = useState("");
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const contado = parseFloat(monto) || 0;
  const esperado = resumen.efectivo_esperado;
  const diferencia = contado - esperado;

  async function submit() {
    setError(null);
    setSaving(true);
    const r = await cerrarCaja(contado, obs.trim() || null, caja.id);
    setSaving(false);
    if (!r.success) { setError(r.error); return; }
    onDone();
  }

  const ajustes = resumen.ajustes_efectivo;

  return (
    <ModalShell title={`Cerrar caja N° ${caja.numero_caja}`} onClose={onClose}>
      {/* 1 · Resumen de ventas del turno (transferencia/tarjeta cuentan al total, no al efectivo) */}
      <SectionLabel>Resumen de ventas del turno</SectionLabel>
      <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <Row label="Cantidad de ventas" value={String(resumen.cantidad_ventas)} />
        <Row label="Ventas en efectivo" value={formatGs(resumen.total_efectivo)} />
        <Row label="Ventas por transferencia" value={formatGs(resumen.total_transferencia)} />
        <Row label="Ventas con tarjeta" value={formatGs(resumen.total_tarjeta)} />
        <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold text-slate-900">
          <span>Total vendido</span><span className="tabular-nums">{formatGs(resumen.total_vendido)}</span>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-slate-400">
        Transferencia y tarjeta suman al total vendido, pero <strong>no</strong> al efectivo que debería haber en caja.
      </p>

      {/* 2 · Arqueo de efectivo → Debería haber en caja (misma fórmula, no se modifica) */}
      <SectionLabel className="mt-4">Arqueo de efectivo</SectionLabel>
      <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <Row label="Monto de apertura" value={formatGs(caja.monto_apertura)} />
        <Row label="Ventas en efectivo" value={`+ ${formatGs(resumen.total_efectivo)}`} />
        <Row label="Ingresos manuales" value={`+ ${formatGs(resumen.ingresos_efectivo)}`} />
        <Row label="Egresos manuales" value={`− ${formatGs(resumen.egresos_efectivo)}`} />
        <Row label="Retiros de efectivo" value={`− ${formatGs(resumen.retiros_efectivo)}`} />
        {ajustes !== 0 && (
          <Row label="Ajustes de efectivo" value={`${ajustes > 0 ? "+" : "−"} ${formatGs(Math.abs(ajustes))}`} />
        )}
        <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold text-slate-900">
          <span>Debería haber en caja</span><span className="tabular-nums">{formatGs(esperado)}</span>
        </div>
      </div>

      {/* 3 · Cierre */}
      <SectionLabel className="mt-4">Cierre</SectionLabel>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">Efectivo contado (Gs.)</label>
      <MontoInput value={monto} onChange={(n) => setMonto(String(n))} placeholder="Ej: 400.000" className={inputClass} decimals={false} />

      {monto !== "" && (
        <div className={`mt-2 flex justify-between rounded-lg px-3 py-2 text-sm font-semibold ${
          diferencia === 0 ? "bg-emerald-50 text-emerald-700"
          : diferencia > 0 ? "bg-sky-50 text-sky-700"
          : "bg-red-50 text-red-700"
        }`}>
          <span>Diferencia {diferencia > 0 ? "(sobra)" : diferencia < 0 ? "(falta)" : ""}</span>
          <span className="tabular-nums">{formatGs(diferencia)}</span>
        </div>
      )}

      <label className="mb-1.5 mt-3 block text-sm font-medium text-slate-700">Observación (opcional)</label>
      <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className={inputClass} />
      <ErrorBanner msg={error} />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">Cancelar</button>
        <button type="button" onClick={submit} disabled={saving || monto === ""} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">
          {saving ? "Cerrando…" : "Confirmar cierre"}
        </button>
      </div>
    </ModalShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span><span className="tabular-nums">{value}</span>
    </div>
  );
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${className}`}>{children}</p>
  );
}

// ── Movimiento ───────────────────────────────────────────────────────────────

const TIPOS: { v: TipoMovimientoCaja; label: string }[] = [
  { v: "ingreso", label: "Ingreso" },
  { v: "egreso", label: "Egreso" },
  { v: "retiro", label: "Retiro" },
  { v: "ajuste", label: "Ajuste" },
];
const MEDIOS: { v: MedioPagoCaja; label: string }[] = [
  { v: "efectivo", label: "Efectivo" },
  { v: "tarjeta", label: "Tarjeta" },
  { v: "transferencia", label: "Transferencia" },
  { v: "otro", label: "Otro" },
];

function MovimientoModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [tipo, setTipo] = useState<TipoMovimientoCaja>("ingreso");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [medio, setMedio] = useState<MedioPagoCaja>("efectivo");
  const [obs, setObs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    if (concepto.trim() === "") { setError("El concepto es obligatorio."); return; }
    if (!(parseFloat(monto) > 0)) { setError("El monto debe ser mayor a 0."); return; }
    setSaving(true);
    const r = await registrarMovimiento({
      tipo, concepto: concepto.trim(), monto: parseFloat(monto) || 0, medio_pago: medio, observacion: obs.trim() || null,
    });
    setSaving(false);
    if (!r.success) { setError(r.error); return; }
    onDone();
  }

  return (
    <ModalShell title="Movimiento de caja" onClose={onClose}>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">Tipo</label>
      <div className="grid grid-cols-4 gap-1">
        {TIPOS.map((t) => (
          <button key={t.v} type="button" onClick={() => setTipo(t.v)}
            className={`rounded-md border py-1.5 text-xs font-medium transition-colors ${
              tipo === t.v ? "border-[#0EA5E9] bg-[#0EA5E9]/10 text-[#0EA5E9]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}>{t.label}</button>
        ))}
      </div>

      <label className="mb-1.5 mt-3 block text-sm font-medium text-slate-700">Concepto</label>
      <input type="text" value={concepto} onChange={(e) => setConcepto(e.target.value)} className={inputClass} placeholder="Ej: pago proveedor / retiro socio" />

      <label className="mb-1.5 mt-3 block text-sm font-medium text-slate-700">Monto (Gs.)</label>
      <MontoInput value={monto} onChange={(n) => setMonto(String(n))} placeholder="Ej: 50.000" className={inputClass} decimals={false} />

      <label className="mb-1.5 mt-3 block text-sm font-medium text-slate-700">Medio de pago</label>
      <div className="grid grid-cols-4 gap-1">
        {MEDIOS.map((m) => (
          <button key={m.v} type="button" onClick={() => setMedio(m.v)}
            className={`rounded-md border py-1.5 text-xs font-medium transition-colors ${
              medio === m.v ? "border-[#0EA5E9] bg-[#0EA5E9]/10 text-[#0EA5E9]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}>{m.label}</button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-slate-400">Solo los movimientos en efectivo afectan el efectivo esperado.</p>

      <label className="mb-1.5 mt-3 block text-sm font-medium text-slate-700">Observación (opcional)</label>
      <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className={inputClass} />
      <ErrorBanner msg={error} />
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">Cancelar</button>
        <button type="button" onClick={submit} disabled={saving} className="rounded-lg bg-[#0EA5E9] px-4 py-2 text-sm font-medium text-white hover:bg-[#0284C7] disabled:opacity-50">
          {saving ? "Guardando…" : "Registrar"}
        </button>
      </div>
    </ModalShell>
  );
}
