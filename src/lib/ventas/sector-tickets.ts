/**
 * Decide qué "pestañas de impresión" (copias de ticket) abrir para una venta,
 * según los sectores de cocina presentes en sus ítems.
 *
 * - Siempre incluye "cliente" (ticket con precios).
 * - Agrega "pizzeria" si hay ítems de pizzería.
 * - Agrega "plancha"  si hay ítems de plancha.
 *
 * Clasifica por prefijo de SKU, ESPEJO EXACTO del `classifyBySku` del endpoint
 * /api/ventas/[id]/ticket. El servidor además clasifica por categoría (fuente de
 * verdad); este helper es para que el frontend sepa CUÁNTAS pestañas abrir sin un
 * round-trip extra. Los SKUs del tenant siguen esta convención (ESP-/PIZ-/HAM-…).
 */

export type CopiaTicket = "cliente" | "pizzeria" | "plancha";

type SectorCocina = "pizzeria" | "plancha" | null;

function classifyBySku(sku: string): SectorCocina {
  const s = (sku || "").toUpperCase();
  if (s.startsWith("PIZ-")) return "pizzeria";
  if (s.startsWith("ESP-")) return "plancha";
  if (s.startsWith("HAM-") || s.startsWith("LOM-") || s.startsWith("PAN-") || s.startsWith("PAP-")) return "plancha";
  return null;
}

/** Lista ordenada de copias a imprimir: cliente, luego pizzería y/o plancha. */
export function sectoresParaTicket(items: ReadonlyArray<{ sku: string }>): CopiaTicket[] {
  const copias: CopiaTicket[] = ["cliente"];
  const hayPizzeria = items.some((i) => classifyBySku(i.sku) === "pizzeria");
  const hayPlancha = items.some((i) => classifyBySku(i.sku) === "plancha");
  if (hayPizzeria) copias.push("pizzeria");
  if (hayPlancha) copias.push("plancha");
  return copias;
}
