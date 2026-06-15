import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/middleware/require-module";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getComandaDetallePg } from "@/lib/comandas/server/comandas-pg";
import { wrapTicketDocument } from "@/lib/printing/thermal-ticket";

const NEGOCIO = "EN LO DE MARI";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function formatFecha(iso: string): string {
  try {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return iso; }
}

/**
 * GET /api/comandas/[id]/print?w=58|80 — ticket de cocina imprimible (HTML).
 *
 * Usa el MISMO layout térmico base que el ticket de Caja (wrapTicketDocument):
 * 80mm por defecto, ?w=58 soportado, mismas tipografías/márgenes/clases. Imprime
 * SOLO los ítems de ESTA comanda (comanda_id), SIN precios ni total. NO registra
 * la impresión (eso lo hace el botón vía POST /imprimir|/reimprimir): recargar
 * esta vista no infla print_count.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModule(request, "comandas");
  if (!gate.ok) return new NextResponse("No autorizado", { status: gate.status });
  const { id } = await ctx.params;
  const schema = await fetchDataSchemaForEmpresaId(gate.auth.empresa_id);
  const c = await getComandaDetallePg(schema, gate.auth.empresa_id, id);
  if (!c) return new NextResponse("Comanda no encontrada", { status: 404 });

  const widthMm = new URL(request.url).searchParams.get("w") === "58" ? 58 : 80;

  // Solo ítems de esta comanda, sin cancelados (no se mezclan otras comandas ni pendientes).
  const itemsHtml = c.items
    .filter((it) => !it.cancelado)
    .map((it) => `
      <tr><td class="qty"><strong>${it.cantidad}×</strong></td><td class="name"><strong>${escapeHtml(it.producto_nombre)}</strong></td></tr>
      ${it.observacion ? `<tr class="sub"><td></td><td colspan="2">&gt;&gt; ${escapeHtml(it.observacion)}</td></tr>` : ""}`)
    .join("");

  const section = `<section class="paper last">
    <div class="sector-banner">COMANDA #${c.numero}</div>
    <h1>${NEGOCIO}</h1>
    <div class="meta">COCINA · ${formatFecha(c.created_at)}</div>
    <hr>
    <div class="pedido">
      <div><strong>Mesa ${c.mesa_numero ?? "—"}</strong></div>
      <div>Mozo: ${escapeHtml(c.mozo_nombre ?? "—")}</div>
    </div>
    <hr>
    <table><tbody>${itemsHtml || '<tr><td colspan="2">(sin ítems)</td></tr>'}</tbody></table>
    <hr>
    <div class="footer">Comanda interna — no es comprobante</div>
  </section>`;

  const html = wrapTicketDocument(section, {
    widthMm, title: `Comanda N°${c.numero} — ${NEGOCIO}`, autoPrint: true,
  });
  return new NextResponse(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
