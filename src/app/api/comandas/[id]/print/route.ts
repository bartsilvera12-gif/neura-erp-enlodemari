import { NextRequest, NextResponse } from "next/server";
import { requireModule } from "@/lib/middleware/require-module";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getComandaDetallePg } from "@/lib/comandas/server/comandas-pg";

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
 * SIN precios (la cocina no los necesita). Auto-imprime al cargar. NO registra la
 * impresión (eso lo hace el botón vía POST /imprimir|/reimprimir); esta vista solo
 * renderiza, así reabrir/recargar no infla print_count.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModule(request, "comandas");
  if (!gate.ok) return new NextResponse("No autorizado", { status: gate.status });
  const { id } = await ctx.params;
  const schema = await fetchDataSchemaForEmpresaId(gate.auth.empresa_id);
  const c = await getComandaDetallePg(schema, gate.auth.empresa_id, id);
  if (!c) return new NextResponse("Comanda no encontrada", { status: 404 });

  const url = new URL(request.url);
  const widthMm = url.searchParams.get("w") === "58" ? 58 : 80;
  const fontPx = widthMm === 58 ? 12 : 13;

  const itemsHtml = c.items
    .filter((it) => !it.cancelado)
    .map((it) => `
      <div class="item">
        <span class="cant">${it.cantidad}×</span> <span class="nom">${escapeHtml(it.producto_nombre)}</span>
        ${it.observacion ? `<div class="obs">&gt;&gt; ${escapeHtml(it.observacion)}</div>` : ""}
      </div>`)
    .join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"/>
<title>Comanda N°${c.numero} — ${NEGOCIO}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: ui-monospace, "Courier New", monospace; font-size: ${fontPx}px; color: #000; background:#f1f1f1; margin:0; padding:16px; }
  .paper { background:#fff; width:${widthMm}mm; margin:0 auto; padding:6mm 4mm; box-shadow:0 1px 4px rgba(0,0,0,.1); }
  h1 { font-size:${fontPx + 5}px; text-align:center; margin:0 0 1mm; letter-spacing:1px; }
  .sub { text-align:center; font-size:${fontPx - 1}px; margin-bottom:2mm; }
  .meta { font-size:${fontPx}px; margin:1mm 0; }
  .meta strong { font-size:${fontPx + 2}px; }
  hr { border:none; border-top:1px dashed #000; margin:2mm 0; }
  .item { margin:1.5mm 0; }
  .cant { font-weight:800; }
  .nom { font-weight:700; }
  .obs { padding-left:6mm; font-size:${fontPx - 1}px; font-style:italic; }
  .foot { text-align:center; font-size:${fontPx - 2}px; margin-top:3mm; }
  .actions { max-width:${widthMm}mm; margin:8mm auto 0; text-align:center; }
  .actions button { padding:8px 16px; font-size:13px; cursor:pointer; border:1px solid #333; background:#fff; border-radius:6px; }
  @media print { body { background:#fff; padding:0; } .paper { width:${widthMm}mm; box-shadow:none; padding:2mm; } .actions { display:none; } @page { margin:0; size:${widthMm}mm auto; } }
</style></head><body>
  <section class="paper">
    <h1>COMANDA #${c.numero}</h1>
    <div class="sub">${NEGOCIO} · COCINA</div>
    <hr>
    <div class="meta"><strong>Mesa: ${c.mesa_numero ?? "—"}</strong></div>
    <div class="meta">Mozo: ${escapeHtml(c.mozo_nombre ?? "—")}</div>
    <div class="meta">${formatFecha(c.created_at)}</div>
    <hr>
    ${itemsHtml || '<div class="item">(sin ítems)</div>'}
    <hr>
    <div class="foot">Comanda interna — no es comprobante</div>
  </section>
  <div class="actions"><button type="button" onclick="window.print()">Imprimir</button></div>
  <script>setTimeout(function(){ try { window.print(); } catch(e){} }, 250);</script>
</body></html>`;

  return new NextResponse(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
