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
export type EstadoItemMesa = "activo" | "cancelado";

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
