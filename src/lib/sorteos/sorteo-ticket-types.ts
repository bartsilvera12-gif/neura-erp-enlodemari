/** Config JSON en `sorteos.ticket_image_config` (sin validación estricta en DB). */

export type SorteoTicketDeliveryMode = "text_only" | "text_and_image" | "image_only";

export type SorteoTicketImageConfig = {
  /** Título visible en el PNG */
  title?: string;
  /** Caption de WhatsApp al enviar la imagen */
  caption?: string;
  /** Pie legal / texto informativo */
  legalFooter?: string;
  /** Último asset de logo subido (bucket + path en Storage) */
  logo_storage_bucket?: string;
  logo_storage_path?: string;
  /** Último fondo subido (bucket + path en Storage) */
  background_storage_bucket?: string;
  background_storage_path?: string;
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  showLogo?: boolean;
  showClienteNombre?: boolean;
  showDocumento?: boolean;
  showTelefono?: boolean;
  showNumeroOrden?: boolean;
  showCupones?: boolean;
  showSorteoNombre?: boolean;
  /** Texto corto si image_only necesita texto aparte (fallback UX) */
  ticket_image_only_stub?: string;
};

export const SORTEO_TICKET_DEFAULT_STUB =
  "Listo, generamos tu comprobante de participación.";

export function normalizeTicketImageConfig(raw: unknown): SorteoTicketImageConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as SorteoTicketImageConfig;
}
