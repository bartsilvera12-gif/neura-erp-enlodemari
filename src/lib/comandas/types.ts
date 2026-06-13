/**
 * Tipos de Comandas — En lo de Mari (schema enlodemari).
 *
 * Una comanda es un TICKET interno: el mozo la genera desde Mesas ("Enviar
 * comanda"), y caja/admin la imprime para pasársela a cocina. No es un kanban de
 * producción: estados = generada → impresa (puede reimprimirse) → o cancelada.
 * Imprimir NO crea venta, NO toca caja, stock ni la mesa.
 */

export type EstadoComanda = "generada" | "impresa" | "cancelada";

export const ESTADOS_COMANDA: EstadoComanda[] = ["generada", "impresa", "cancelada"];

export interface ComandaItem {
  id: string;
  producto_nombre: string;
  cantidad: number;
  observacion: string | null;
  total: number;
  /** estado del ítem en la cuenta (cancelado en Mesas), no de la comanda. */
  cancelado: boolean;
}

export interface ComandaCard {
  id: string;
  numero: number;
  estado: EstadoComanda;
  created_at: string;
  mesa_numero: number | null;
  mozo_nombre: string | null;
  /** Suma de ítems vigentes (uso interno; el ticket de cocina NO muestra precio). */
  total: number;
  items: ComandaItem[];
  printed_at: string | null;
  print_count: number;
}
