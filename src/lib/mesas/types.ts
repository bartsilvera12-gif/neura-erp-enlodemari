/**
 * Tipos del módulo Mesas — En lo de Mari (schema enlodemari).
 *
 * El mozo abre una cuenta por mesa (mesa_sesiones) y le agrega ítems
 * (mesa_sesion_items). NO se crea venta ni se toca stock/caja hasta que CAJA
 * factura la mesa, reutilizando la lógica de ventas/caja. La conversión a venta
 * es idempotente (mesa_sesiones.venta_id).
 */

export type EstadoMesa = "libre" | "ocupada" | "por_cobrar" | "cerrada" | "inactiva";
export type EstadoSesion = "abierta" | "por_cobrar" | "facturada" | "cancelada";
/**
 * Estado de un ítem de cuenta:
 *  - pendiente: agregado por el mozo, aún no enviado a cocina (editable/cancelable).
 *  - enviado: incluido en una comanda (cocina). Sigue contando en la cuenta.
 *  - cancelado: anulado (no cuenta).
 */
export type EstadoItemMesa = "pendiente" | "enviado" | "cancelado";

export interface Mesa {
  id: string;
  numero: number;
  nombre: string | null;
  estado: EstadoMesa;
  activo: boolean;
}

export interface MesaSesion {
  id: string;
  mesa_id: string;
  estado: EstadoSesion;
  mozo_id: string | null;
  abierta_at: string;
  enviada_caja_at: string | null;
  cerrada_at: string | null;
  venta_id: string | null;
  observacion: string | null;
}

export interface MesaSesionItem {
  id: string;
  sesion_id: string;
  producto_id: string;
  producto_nombre: string;
  sku: string | null;
  cantidad: number;
  precio_unitario: number;
  total: number;
  observacion: string | null;
  estado: EstadoItemMesa;
  comanda_id: string | null;
  enviado_at: string | null;
}

/** Una comanda enviada a cocina (un envío de ítems de una sesión). */
export interface Comanda {
  id: string;
  sesion_id: string;
  numero: number;
  created_at: string;
  items_count: number;
}

/** Mesa + resumen de su sesión viva (para el grid y la lista por-cobrar). */
export interface MesaConResumen {
  mesa: Mesa;
  sesion: MesaSesion | null;
  total: number;
  items_count: number;
  mozo_nombre: string | null;
}

/** Detalle completo de una mesa: mesa + sesión viva + ítems activos. */
export interface MesaDetalle {
  mesa: Mesa;
  sesion: MesaSesion | null;
  items: MesaSesionItem[];
  total: number;
}
