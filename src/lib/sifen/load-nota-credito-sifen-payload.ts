import type { AppSupabaseClient } from "@/lib/supabase/schema";
import type { SifenNotaCreditoPayload } from "./types";
import type { AmbienteSifen } from "./types";
import { downloadSifenObject } from "./sifen-storage";
import { extractOrigenFiscalDesdeRdeXml } from "./parse-kude-from-signed-xml";
import {
  MSG_CONFIG_TIMBRADO_INVALIDA,
  feIniTimbradoAIso,
  rucConfigCoincideConEmisorXml,
  timbradoNumeroValido,
  timbradoOrigenCoincideConCdc,
} from "./validar-timbrado-origen-nc";

export type LoadNotaCreditoSifenPayloadOpts = {
  /** Si se define, el XML rDE usa este ambiente (p. ej. test con ALLOW_TEST_MODE + pipeline *-test). */
  ambienteDeXml?: AmbienteSifen;
};

export type LoadNcSifenPayloadFailure =
  | { status: 400; message: string }
  | { status: 404; message: string }
  | { status: 409; message: string };

export type LoadNcSifenPayloadResult =
  | { ok: true; payload: SifenNotaCreditoPayload; ambiente: AmbienteSifen }
  | { ok: false; error: LoadNcSifenPayloadFailure };

function ambienteDesdeConfigRow(raw: unknown): AmbienteSifen {
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "produccion" ? "produccion" : "test";
}

/**
 * Carga NC, DE origen (CDC), factura, cliente y config SIFEN para armar el rDE de nota de crédito.
 */
export async function loadValidatedNotaCreditoSifenPayload(
  supabase: AppSupabaseClient,
  empresaId: string,
  notaCreditoId: string,
  opts?: LoadNotaCreditoSifenPayloadOpts
): Promise<LoadNcSifenPayloadResult> {
  const nid = notaCreditoId.trim();

  const { data: nc, error: errNc } = await supabase
    .from("nota_credito")
    .select(
      "id, empresa_id, factura_id, cliente_id, monto, motivo, estado_erp, factura_electronica_origen_id, created_at"
    )
    .eq("id", nid)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (errNc) {
    return { ok: false, error: { status: 400, message: errNc.message } };
  }
  if (!nc) {
    return { ok: false, error: { status: 404, message: "Nota de crédito no encontrada." } };
  }

  const estadoErp = String((nc as { estado_erp?: string }).estado_erp ?? "");
  if (estadoErp === "anulada_borrador") {
    return { ok: false, error: { status: 409, message: "La nota de crédito está anulada." } };
  }

  const facturaId = String((nc as { factura_id: string }).factura_id);
  const feOrigenId = (nc as { factura_electronica_origen_id?: string | null }).factura_electronica_origen_id;
  if (feOrigenId == null || String(feOrigenId).trim() === "") {
    return {
      ok: false,
      error: { status: 400, message: "La NC no tiene documento electrónico de factura origen vinculado." },
    };
  }

  const { data: ne, error: errNe } = await supabase
    .from("nota_credito_electronica")
    .select("id, estado_sifen, cdc_factura_origen")
    .eq("nota_credito_id", nid)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (errNe) {
    return { ok: false, error: { status: 400, message: errNe.message } };
  }
  if (!ne) {
    return { ok: false, error: { status: 404, message: "No hay registro nota_credito_electronica para esta NC." } };
  }

  const { data: feOrigen, error: errFe } = await supabase
    .from("factura_electronica")
    .select("id, cdc, estado_sifen, xml_firmado_path, xml_path, factura_id")
    .eq("id", String(feOrigenId))
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (errFe) {
    return { ok: false, error: { status: 400, message: errFe.message } };
  }
  if (!feOrigen) {
    return { ok: false, error: { status: 404, message: "No se encontró la factura electrónica origen." } };
  }

  const cdcOrigen = feOrigen.cdc == null ? "" : String(feOrigen.cdc).trim();
  if (!cdcOrigen || cdcOrigen.length !== 44) {
    return {
      ok: false,
      error: { status: 400, message: "La factura origen no tiene CDC válido (44 dígitos). Aprobá el DE primero." },
    };
  }

  const xmlPathFirmado =
    feOrigen.xml_firmado_path == null ? "" : String(feOrigen.xml_firmado_path).trim();
  const xmlPathBorrador = feOrigen.xml_path == null ? "" : String(feOrigen.xml_path).trim();
  const pathXmlOrigen = xmlPathFirmado || xmlPathBorrador;
  if (!pathXmlOrigen) {
    return {
      ok: false,
      error: {
        status: 400,
        message: `${MSG_CONFIG_TIMBRADO_INVALIDA}: no hay XML de la factura origen en storage (firmado o borrador).`,
      },
    };
  }

  const binOrigen = await downloadSifenObject(supabase, pathXmlOrigen);
  if (!binOrigen.ok) {
    return {
      ok: false,
      error: {
        status: 400,
        message: `${MSG_CONFIG_TIMBRADO_INVALIDA}: no se pudo descargar el XML de la factura origen (${binOrigen.message}).`,
      },
    };
  }

  let origenFiscal: ReturnType<typeof extractOrigenFiscalDesdeRdeXml>;
  try {
    origenFiscal = extractOrigenFiscalDesdeRdeXml(binOrigen.data.toString("utf8"));
  } catch (e) {
    const det = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: {
        status: 400,
        message: `${MSG_CONFIG_TIMBRADO_INVALIDA}: no se pudo leer el timbrado del XML de la factura origen (${det}).`,
      },
    };
  }

  if (origenFiscal.cdcId.replace(/\D/g, "") !== cdcOrigen.replace(/\D/g, "")) {
    return {
      ok: false,
      error: {
        status: 400,
        message: `${MSG_CONFIG_TIMBRADO_INVALIDA}: el CDC guardado no coincide con el XML origen (Id del DE).`,
      },
    };
  }

  const tipoOrigen = origenFiscal.iTiDE.replace(/\D/g, "").trim();
  const iTiDeNum = Number.parseInt(tipoOrigen.replace(/^0+/, "") || "0", 10);
  if (iTiDeNum !== 1) {
    return {
      ok: false,
      error: {
        status: 400,
        message: `${MSG_CONFIG_TIMBRADO_INVALIDA}: el documento origen no es factura electrónica (iTiDE distinto de 1).`,
      },
    };
  }

  const t = origenFiscal.timbrado;
  if (!t.dNumTim.trim() || !t.dEst.trim() || !t.dPunExp.trim() || !t.dFeIniT.trim()) {
    return {
      ok: false,
      error: {
        status: 400,
        message: `${MSG_CONFIG_TIMBRADO_INVALIDA}: faltan datos de timbrado (dNumTim, dEst, dPunExp o dFeIniT) en el XML origen.`,
      },
    };
  }

  if (!timbradoNumeroValido(t)) {
    return {
      ok: false,
      error: {
        status: 400,
        message: `${MSG_CONFIG_TIMBRADO_INVALIDA}: número de timbrado inválido en el XML de la factura origen.`,
      },
    };
  }

  if (!timbradoOrigenCoincideConCdc(cdcOrigen, t)) {
    return {
      ok: false,
      error: {
        status: 400,
        message: `${MSG_CONFIG_TIMBRADO_INVALIDA}: establecimiento o punto de expedición del XML no coinciden con el CDC vinculado.`,
      },
    };
  }

  const { data: factura, error: errF } = await supabase
    .from("facturas")
    .select("id, cliente_id, numero_factura, fecha, tipo, moneda, monto, saldo")
    .eq("id", facturaId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (errF) {
    return { ok: false, error: { status: 400, message: errF.message } };
  }
  if (!factura) {
    return { ok: false, error: { status: 404, message: "Factura no encontrada." } };
  }

  const clienteId = factura.cliente_id as string;

  const [clienteRes, configRes] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, empresa, nombre_contacto, nombre, ruc, documento, direccion, telefono, email")
      .eq("id", clienteId)
      .eq("empresa_id", empresaId)
      .maybeSingle(),
    supabase
      .from("empresa_sifen_config")
      .select(
        "ruc, razon_social, direccion_fiscal, timbrado_numero, timbrado_fecha_inicio_vigencia, actividad_economica_codigo, actividad_economica_descripcion, establecimiento, punto_expedicion, csc, activo, ambiente"
      )
      .eq("empresa_id", empresaId)
      .maybeSingle(),
  ]);

  if (clienteRes.error) {
    return { ok: false, error: { status: 400, message: clienteRes.error.message } };
  }
  if (configRes.error) {
    return { ok: false, error: { status: 400, message: configRes.error.message } };
  }
  if (!clienteRes.data) {
    return { ok: false, error: { status: 404, message: "Cliente no encontrado." } };
  }
  if (!configRes.data) {
    return { ok: false, error: { status: 400, message: "No hay configuración SIFEN para esta empresa." } };
  }

  const cfg = configRes.data as Record<string, unknown>;
  const cli = clienteRes.data as Record<string, unknown>;

  const moneda = String(factura.moneda ?? "GS").toUpperCase();
  if (moneda !== "GS") {
    return {
      ok: false,
      error: { status: 400, message: "Nota de crédito SIFEN: por ahora solo moneda GS (PYG)." },
    };
  }

  const nombreRec =
    String(cli.nombre_contacto ?? "").trim() ||
    String(cli.nombre ?? "").trim() ||
    String(cli.empresa ?? "").trim() ||
    "Receptor";

  if ((cfg as { activo?: unknown }).activo === false) {
    return {
      ok: false,
      error: {
        status: 400,
        message: `${MSG_CONFIG_TIMBRADO_INVALIDA}: la configuración SIFEN de la empresa está inactiva.`,
      },
    };
  }

  if (!rucConfigCoincideConEmisorXml(String(cfg.ruc ?? ""), origenFiscal)) {
    return {
      ok: false,
      error: {
        status: 400,
        message: `${MSG_CONFIG_TIMBRADO_INVALIDA}: el RUC del emisor en el XML de la factura origen no coincide con el RUC configurado.`,
      },
    };
  }

  let timIniIso: string;
  try {
    timIniIso = feIniTimbradoAIso(t.dFeIniT);
  } catch (e) {
    const det = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: {
        status: 400,
        message: `${MSG_CONFIG_TIMBRADO_INVALIDA}: fecha de inicio de vigencia del timbrado en el XML origen no es válida (${det}).`,
      },
    };
  }

  const fechaNc = String((factura as { fecha: string }).fecha).trim().slice(0, 10);
  if (fechaNc < timIniIso) {
    return {
      ok: false,
      error: {
        status: 400,
        message: `${MSG_CONFIG_TIMBRADO_INVALIDA}: la fecha de emisión es anterior al inicio de vigencia del timbrado de la factura origen.`,
      },
    };
  }

  const cActOrigen = origenFiscal.actividad.cActEco.trim();
  const dActOrigen = origenFiscal.actividad.dDesActEco.trim();
  const cActCfg =
    cfg.actividad_economica_codigo == null ? "" : String(cfg.actividad_economica_codigo).trim();
  const dActCfg =
    cfg.actividad_economica_descripcion == null ? "" : String(cfg.actividad_economica_descripcion).trim();
  const cAct = cActOrigen || cActCfg;
  const dAct = dActOrigen || dActCfg;
  if (!cAct || !dAct) {
    return {
      ok: false,
      error: {
        status: 400,
        message: `${MSG_CONFIG_TIMBRADO_INVALIDA}: falta actividad económica (código y descripción) en el XML origen y en la configuración SIFEN.`,
      },
    };
  }

  const payload: SifenNotaCreditoPayload = {
    emisor: {
      ruc: String(cfg.ruc ?? "").trim(),
      razon_social: String(cfg.razon_social ?? "").trim(),
      direccion_fiscal: String(cfg.direccion_fiscal ?? "").trim(),
      /** Timbrado y sucursales tomados del DE origen (XML), no de la fila global de configuración. */
      timbrado_numero: t.dNumTim.trim(),
      timbrado_fecha_inicio_vigencia: timIniIso,
      actividad_economica_codigo: cAct,
      actividad_economica_descripcion: dAct,
      establecimiento: t.dEst.trim(),
      punto_expedicion: t.dPunExp.trim(),
      csc: cfg.csc == null ? null : String(cfg.csc).trim(),
    },
    receptor: {
      cliente_id: String(cli.id),
      nombre: nombreRec,
      ruc: cli.ruc == null || String(cli.ruc).trim() === "" ? null : String(cli.ruc).trim(),
      documento: cli.documento == null || String(cli.documento).trim() === "" ? null : String(cli.documento).trim(),
      direccion: cli.direccion == null ? null : String(cli.direccion).trim(),
      telefono: cli.telefono == null ? null : String(cli.telefono).trim(),
      email: cli.email == null ? null : String(cli.email).trim(),
    },
    notaCredito: {
      id: String((nc as { id: string }).id),
      monto: Number((nc as { monto: unknown }).monto),
      motivo: String((nc as { motivo: string }).motivo ?? "").trim(),
      fecha_emision: String((factura as { fecha: string }).fecha).trim(),
    },
    facturaOrigen: {
      numero_factura: String((factura as { numero_factura: string }).numero_factura),
      fecha: String((factura as { fecha: string }).fecha),
      moneda,
    },
    documentoElectronicoOrigen: { cdc: cdcOrigen },
    sifen: {
      nota_credito_electronica_id: String((ne as { id: string }).id),
      estado_sifen: String((ne as { estado_sifen?: string }).estado_sifen ?? "sin_envio"),
    },
  };

  if (!payload.emisor.ruc || !payload.emisor.razon_social) {
    return { ok: false, error: { status: 400, message: "Configuración SIFEN incompleta (RUC / razón social)." } };
  }

  const ambienteCfg = ambienteDesdeConfigRow(cfg.ambiente);
  const ambiente = opts?.ambienteDeXml ?? ambienteCfg;

  return {
    ok: true,
    payload,
    ambiente,
  };
}
