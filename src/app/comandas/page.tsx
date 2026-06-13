"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cancelarComanda, comandaPrintUrl, getComandas, imprimirComanda, reimprimirComanda,
} from "@/lib/comandas/storage";
import type { ComandaCard } from "@/lib/comandas/types";

function formatHora(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-PY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export default function ComandasPage() {
  const [comandas, setComandas] = useState<ComandaCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verDetalle, setVerDetalle] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setComandas(await getComandas());
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = () => { if (!cancelled) void load(); };
    run();
    const t = setInterval(run, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, [load]);

  const paraImprimir = useMemo(() => comandas.filter((c) => c.estado === "generada"), [comandas]);
  const impresas = useMemo(() => comandas.filter((c) => c.estado === "impresa"), [comandas]);

  function toggleDetalle(id: string) {
    setVerDetalle((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  // Imprimir/Reimprimir: pre-abrimos la pestaña (gesto del usuario) y luego la
  // apuntamos al ticket, tras registrar la impresión en el server.
  async function onImprimir(c: ComandaCard, reimpresion: boolean) {
    setError(null); setBusy(c.id);
    const w = window.open("about:blank", "_blank");
    const r = reimpresion ? await reimprimirComanda(c.id) : await imprimirComanda(c.id);
    setBusy(null);
    if (!r.success) { try { w?.close(); } catch {} setError(r.error); return; }
    const href = comandaPrintUrl(c.id);
    try { if (w) w.location.href = href; else window.open(href, "_blank", "noopener"); } catch {}
    void load();
  }

  async function onCancelar(c: ComandaCard) {
    if (!confirm(`¿Cancelar la comanda N°${c.numero} (Mesa ${c.mesa_numero ?? "?"})? No afecta la cuenta de la mesa.`)) return;
    setError(null); setBusy(c.id);
    const r = await cancelarComanda(c.id);
    setBusy(null);
    if (!r.success) { setError(r.error); return; }
    void load();
  }

  function ItemsList({ c }: { c: ComandaCard }) {
    const items = c.items.filter((i) => !i.cancelado);
    return (
      <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
        {items.map((it) => (
          <li key={it.id} className="text-sm text-slate-800">
            <span className="font-semibold">{it.cantidad}×</span> {it.producto_nombre}
            {it.observacion && <span className="block pl-5 text-xs text-amber-700">— {it.observacion}</span>}
          </li>
        ))}
      </ul>
    );
  }

  function Card({ c, seccion }: { c: ComandaCard; seccion: "imprimir" | "impresa" }) {
    const vigentes = c.items.filter((i) => !i.cancelado).length;
    const abierto = verDetalle.has(c.id);
    return (
      <div className={`rounded-xl border bg-white p-3 shadow-sm ${seccion === "imprimir" ? "border-amber-300" : "border-slate-200"}`}>
        <div className="flex items-center justify-between">
          <span className="text-base font-bold text-slate-800">Comanda N°{c.numero}</span>
          <span className="text-xs text-slate-400">{formatHora(c.created_at)}</span>
        </div>
        <p className="text-sm text-slate-600">Mesa <strong>{c.mesa_numero ?? "—"}</strong> · Mozo: {c.mozo_nombre ?? "—"}</p>
        <p className="text-xs text-slate-500">{vigentes} ítem(s)
          {seccion === "impresa" && <> · impresa {formatHora(c.printed_at)}{c.print_count > 1 ? ` · ${c.print_count} impresiones` : ""}</>}
        </p>

        {abierto && <ItemsList c={c} />}

        <div className="mt-3 flex flex-wrap gap-2">
          {seccion === "imprimir" ? (
            <button type="button" onClick={() => onImprimir(c, false)} disabled={busy === c.id}
              className="flex-1 rounded-lg bg-[#0EA5E9] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#0284C7] active:scale-95 disabled:opacity-50">
              Imprimir
            </button>
          ) : (
            <button type="button" onClick={() => onImprimir(c, true)} disabled={busy === c.id}
              className="flex-1 rounded-lg bg-slate-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 active:scale-95 disabled:opacity-50">
              Reimprimir
            </button>
          )}
          <button type="button" onClick={() => toggleDetalle(c.id)}
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            {abierto ? "Ocultar" : "Ver detalle"}
          </button>
          {seccion === "imprimir" && (
            <button type="button" onClick={() => onCancelar(c)} disabled={busy === c.id}
              className="rounded-lg border border-rose-200 px-3 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">
              Cancelar
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Comandas</h1>
        <p className="text-sm text-slate-500">Imprimí las comandas y pasáselas a cocina. Se actualiza solo.</p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">⚠ {error}</div>}

      {loading ? (
        <p className="py-10 text-center text-slate-400">Cargando comandas…</p>
      ) : (
        <>
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-600">
              Comandas para imprimir <span className="ml-1 rounded-full bg-amber-100 px-2 text-xs text-amber-800">{paraImprimir.length}</span>
            </h2>
            {paraImprimir.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">No hay comandas pendientes de imprimir.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {paraImprimir.map((c) => <Card key={c.id} c={c} seccion="imprimir" />)}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Comandas impresas hoy <span className="ml-1 rounded-full bg-slate-100 px-2 text-xs text-slate-600">{impresas.length}</span>
            </h2>
            {impresas.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">Todavía no imprimiste ninguna.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {impresas.map((c) => <Card key={c.id} c={c} seccion="impresa" />)}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
