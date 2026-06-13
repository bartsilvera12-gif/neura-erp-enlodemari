/**
 * Tipos del tablero de Comandas (cocina) — En lo de Mari (schema enlodemari).
 *
 * Una comanda es un envío a cocina de los ítems pendientes de una mesa
 * (enlodemari.comandas). Tiene un flujo propio de cocina, independiente del
 * cobro/facturación: enviada → en_preparacion → lista → entregada (o cancelada).
 */

export type EstadoComanda = "enviada" | "en_preparacion" | "lista" | "entregada" | "cancelada";

export const ESTADOS_COMANDA: EstadoComanda[] = [
  "enviada", "en_preparacion", "lista", "entregada", "cancelada",
];

export interface ComandaItem {
  id: string;
  producto_nombre: string;
  cantidad: number;
  observacion: string | null;
  total: number;
  /** estado del ítem en la cuenta (enviado/cancelado), no de la comanda. */
  cancelado: boolean;
}

export interface ComandaCard {
  id: string;
  numero: number;
  estado: EstadoComanda;
  created_at: string;
  mesa_numero: number | null;
  mozo_nombre: string | null;
  total: number;
  items: ComandaItem[];
}
