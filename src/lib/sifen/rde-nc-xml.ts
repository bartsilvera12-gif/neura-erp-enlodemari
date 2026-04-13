/**
 * rDE SIFEN v150 — Nota de crédito electrónica (iTiDE=5).
 * Estructura alineada a pysifen/de/samples/v150/nota_credito.xml (sin dTotOpeGs / dTotalGs en PYG).
 */
import type { AmbienteSifen, SifenNotaCreditoPayload } from "./types";
import {
  SIFEN_TEST_CSC_GENERICO,
  SIFEN_TEST_LITERAL_DOCUMENTO,
} from "./sifen-ambiente-test";
import { SIFEN_EKUATIA_TARGET_NS, SIFEN_SIRECEP_DE_V150_XSD_FILE } from "./sifen-xsi-schema-location";
import { escapeXml } from "./xml";
import {
  fechaEmisionCdc,
  generarCdcFacturaElectronica,
  normalizarNumeroDocumentoSifen,
  normalizarNumeroTimbrado,
  normalizarCodigoTres,
  formatoCuerpoRucTipoTruc,
  padDigits,
  splitRucParaXml,
  I_TI_DE_NCE,
} from "./sifen-cdc";
import {
  BuildRdeXmlOptions,
  sifenDCodSegNueveDigitos,
  sifenDFeEmiDeYFecFirma,
  sifenEmisorITipContCodigo,
} from "./rde-xml";

const NS = SIFEN_EKUATIA_TARGET_NS;
const XMLNS_XSI = "http://www.w3.org/2001/XMLSchema-instance";
const RDE_XSI_SCHEMA_LOCATION = `${NS} ${SIFEN_SIRECEP_DE_V150_XSD_FILE}`;

const XSD_DES_TI_DE_NCE = "Nota de crédito electrónica";
const XSD_DES_TIP_TRA_VENTA_MERC = "Venta de mercadería";
const XSD_DES_T_IMP_IVA = "IVA";
const XSD_DES_MONE_PYG = "Guarani";
const XSD_DES_AFEC_GRAVADO = "Gravado IVA";
const XSD_DES_DOC_CI_PY = "Cédula paraguaya";
const XSD_DES_UNI_MED = "UNI";

function textEl(name: string, value: string | number): string {
  const c = escapeXml(String(value));
  return `<${name}>${c}</${name}>`;
}

function montoRedondeo(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toFixed(4);
}

function splitIvaIncluidoDesdeTotal(totalConIva: number, tasa: 5 | 10): { base: number; iva: number } {
  const T = Math.round(totalConIva);
  if (tasa === 10) {
    const base = Math.round(T / 1.1);
    return { base, iva: T - base };
  }
  const base = Math.round(T / 1.05);
  return { base, iva: T - base };
}

function vigenciaIso(dateYmd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd.trim());
  if (!m) throw new Error(`Fecha timbrado inválida (use YYYY-MM-DD): ${dateYmd}`);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Número de documento NC (7 dígitos) derivado del UUID para unicidad estable por fila. */
export function numeroDocumentoNcDesdeId(ncId: string): string {
  const hex = ncId.replace(/-/g, "").slice(0, 12);
  const n = parseInt(hex, 16);
  const mod = Number.isFinite(n) ? (n % 9000000) + 1000000 : 1000000;
  return normalizarNumeroDocumentoSifen(String(mod));
}

/**
 * Mapea texto libre del ERP a par (iMotEmi, dDesMotEmi) del XSD tgCamNCDE.
 */
export function mapMotivoNcSifen(motivo: string): { iMotEmi: string; dDesMotEmi: string } {
  const t = motivo.toLowerCase();
  if (/descuent/.test(t)) return { iMotEmi: "3", dDesMotEmi: "Descuento" };
  if (/bonif/.test(t)) return { iMotEmi: "4", dDesMotEmi: "Bonificación" };
  if (/incobrable|moros/.test(t)) return { iMotEmi: "5", dDesMotEmi: "Crédito incobrable" };
  if (/recupero.*costo/.test(t)) return { iMotEmi: "6", dDesMotEmi: "Recupero de costo" };
  if (/recupero.*gasto/.test(t)) return { iMotEmi: "7", dDesMotEmi: "Recupero de gasto" };
  if (/ajuste.*precio/.test(t)) return { iMotEmi: "8", dDesMotEmi: "Ajuste de precio" };
  if (/^devoluc/i.test(t) && !/ajuste/.test(t)) return { iMotEmi: "2", dDesMotEmi: "Devolución" };
  return { iMotEmi: "1", dDesMotEmi: "Devolución y Ajuste de precios" };
}

/**
 * Construye el XML rDE de nota de crédito electrónica (iTiDE=5), listo para firmar el nodo `DE`.
 */
export function buildOfficialRdeNotaCreditoElectronicaXml(
  base: SifenNotaCreditoPayload,
  opts: BuildRdeXmlOptions
): string {
  const { emisor, receptor, notaCredito, documentoElectronicoOrigen } = base;
  const ambiente: AmbienteSifen = opts.ambiente ?? "produccion";
  const esAmbienteTest = ambiente === "test";

  let cscParaCodSeg: string;
  if (esAmbienteTest) {
    const cscCfg = emisor.csc == null ? "" : String(emisor.csc).trim();
    cscParaCodSeg = cscCfg !== "" ? cscCfg : SIFEN_TEST_CSC_GENERICO;
  } else {
    const csc = emisor.csc;
    if (csc == null || String(csc).trim() === "") {
      throw new Error("Falta CSC en configuración SIFEN para generar el DE de nota de crédito.");
    }
    cscParaCodSeg = String(csc).trim();
  }

  const { cuerpo: rucEmCuerpo, dDV: dDVEmi } = splitRucParaXml(emisor.ruc);
  const dRucEmCdc = padDigits(rucEmCuerpo, 8);
  const dNumTim = normalizarNumeroTimbrado(emisor.timbrado_numero);
  const dEst = normalizarCodigoTres(emisor.establecimiento);
  const dPunExp = normalizarCodigoTres(emisor.punto_expedicion);
  const dNumDoc = numeroDocumentoNcDesdeId(notaCredito.id);
  const fechaCdc = fechaEmisionCdc(notaCredito.fecha_emision);
  const iTipContEmi = sifenEmisorITipContCodigo(emisor.razon_social);
  const semillaSeg = base.sifen.nota_credito_electronica_id;
  const dCodSeg = sifenDCodSegNueveDigitos(cscParaCodSeg, semillaSeg);

  const { cdc, dDVId } = generarCdcFacturaElectronica({
    iTiDE: I_TI_DE_NCE,
    dRucEm: dRucEmCdc,
    dDVEmi,
    dEst,
    dPunExp,
    numeroFactura: dNumDoc,
    fechaEmision: fechaCdc,
    iTipContEmisor: iTipContEmi,
    iTipEmi: "1",
    dCodSeg,
  });

  const ahora = opts.fechaHoraEmision ?? new Date();
  const dFeEmiDE = sifenDFeEmiDeYFecFirma(notaCredito.fecha_emision, ahora);
  const dFecFirma = dFeEmiDE;
  const dFeIniT = vigenciaIso(opts.timbradoFechaInicio);

  const telEmi = opts.emisorTelefono.replace(/\D/g, "");
  if (telEmi.length < 8 || telEmi.length > 15) {
    throw new Error("emisorTelefono debe tener entre 8 y 15 dígitos para gEmis.dTelEmi.");
  }
  const dirEmi = opts.emisorDireccion.trim();
  if (dirEmi.length < 1) throw new Error("emisorDireccion es obligatoria.");

  const dep = (opts.emisorDepartamento ?? "1").trim();
  const depDes = (opts.emisorDepartamentoDescripcion ?? "CAPITAL").trim();
  const cAct = opts.actividadEconomicaCodigo?.trim() ?? "";
  const dActDes = opts.actividadEconomicaDescripcion?.trim() ?? "";
  if (!cAct || !dActDes) {
    throw new Error("Faltan actividadEconomicaCodigo y actividadEconomicaDescripcion.");
  }

  const dNomEmi = esAmbienteTest ? SIFEN_TEST_LITERAL_DOCUMENTO : emisor.razon_social.trim();

  const gEmisParts: string[] = [
    "<gEmis>",
    textEl("dRucEm", dRucEmCdc),
    textEl("dDVEmi", dDVEmi),
    textEl("iTipCont", iTipContEmi),
    textEl("dNomEmi", dNomEmi),
    textEl("dDirEmi", dirEmi),
    textEl("dNumCas", opts.emisorNumCasa),
    textEl("cDepEmi", dep),
    textEl("dDesDepEmi", depDes),
  ];
  if (opts.emisorDistrito?.trim()) {
    gEmisParts.push(textEl("cDisEmi", opts.emisorDistrito.replace(/\D/g, "").slice(0, 4)));
    gEmisParts.push(textEl("dDesDisEmi", (opts.emisorDistritoDescripcion ?? "").trim() || "ASUNCION"));
  }
  if (opts.emisorCiudad?.trim()) {
    gEmisParts.push(textEl("cCiuEmi", opts.emisorCiudad.replace(/\D/g, "").slice(0, 5)));
    gEmisParts.push(textEl("dDesCiuEmi", (opts.emisorCiudadDescripcion ?? "").trim() || "ASUNCION"));
  } else {
    gEmisParts.push(textEl("cCiuEmi", "1"));
    gEmisParts.push(textEl("dDesCiuEmi", "ASUNCION (DISTRITO)"));
  }
  gEmisParts.push(textEl("dTelEmi", telEmi));
  gEmisParts.push(textEl("dEmailE", opts.emisorEmail.trim()));
  gEmisParts.push("<gActEco>");
  gEmisParts.push(textEl("cActEco", cAct));
  gEmisParts.push(textEl("dDesActEco", dActDes));
  gEmisParts.push("</gActEco>");
  gEmisParts.push("</gEmis>");

  const recParts: string[] = ["<gDatRec>"];
  if (receptor.ruc?.trim()) {
    const { cuerpo: dRucRec, dDV: dDVRec } = splitRucParaXml(receptor.ruc.trim());
    const iTiContRec = sifenEmisorITipContCodigo(receptor.nombre);
    recParts.push(textEl("iNatRec", "1"));
    recParts.push(textEl("iTiOpe", "1"));
    recParts.push(textEl("cPaisRec", "PRY"));
    recParts.push(textEl("dDesPaisRe", "Paraguay"));
    recParts.push(textEl("iTiContRec", iTiContRec));
    recParts.push(textEl("dRucRec", formatoCuerpoRucTipoTruc(dRucRec)));
    recParts.push(textEl("dDVRec", dDVRec));
    recParts.push(textEl("dNomRec", receptor.nombre.trim()));
    if (receptor.direccion?.trim()) recParts.push(textEl("dDirRec", receptor.direccion.trim()));
    if (receptor.telefono?.trim()) {
      const tr = receptor.telefono.replace(/\D/g, "");
      if (tr.length >= 8) recParts.push(textEl("dTelRec", tr.slice(0, 15)));
    }
    if (receptor.email?.trim()) recParts.push(textEl("dEmailRec", receptor.email.trim()));
  } else {
    const doc = (receptor.documento ?? "").replace(/\s/g, "").trim();
    if (!doc) throw new Error("Receptor sin RUC: se requiere documento (CI) en cliente.");
    recParts.push(textEl("iNatRec", "2"));
    recParts.push(textEl("iTiOpe", "1"));
    recParts.push(textEl("cPaisRec", "PRY"));
    recParts.push(textEl("dDesPaisRe", "Paraguay"));
    recParts.push(textEl("iTipIDRec", "1"));
    recParts.push(textEl("dDTipIDRec", XSD_DES_DOC_CI_PY));
    recParts.push(textEl("dNumIDRec", doc.slice(0, 20)));
    recParts.push(textEl("dNomRec", receptor.nombre.trim()));
    if (receptor.direccion?.trim()) recParts.push(textEl("dDirRec", receptor.direccion.trim()));
    if (receptor.telefono?.trim()) {
      const tr = receptor.telefono.replace(/\D/g, "");
      if (tr.length >= 8) recParts.push(textEl("dTelRec", tr.slice(0, 15)));
    }
    if (receptor.email?.trim()) recParts.push(textEl("dEmailRec", receptor.email.trim()));
  }
  recParts.push("</gDatRec>");

  const { iMotEmi, dDesMotEmi } = mapMotivoNcSifen(notaCredito.motivo);
  const T = Math.round(Number(notaCredito.monto));
  if (!(T > 0)) throw new Error("El monto de la nota de crédito debe ser mayor a cero.");
  const sp = splitIvaIncluidoDesdeTotal(T, 10);
  const baseGrav = sp.base;
  const dLiq = sp.iva;
  const dTotOpeItem = T;

  const dDesProSer =
    esAmbienteTest && SIFEN_TEST_LITERAL_DOCUMENTO.length > 0
      ? SIFEN_TEST_LITERAL_DOCUMENTO.slice(0, 120)
      : `Nota de crédito — ${notaCredito.motivo.slice(0, 100)}`;

  const itemXml = [
    "<gCamItem>",
    textEl("dCodInt", "NC1"),
    textEl("dDesProSer", dDesProSer),
    textEl("cUniMed", "77"),
    textEl("dDesUniMed", XSD_DES_UNI_MED),
    textEl("dCantProSer", "1"),
    "<gValorItem>",
    textEl("dPUniProSer", dTotOpeItem),
    textEl("dTotBruOpeItem", dTotOpeItem),
    "<gValorRestaItem>",
    textEl("dDescItem", "0"),
    textEl("dTotOpeItem", dTotOpeItem),
    "</gValorRestaItem>",
    "</gValorItem>",
    "<gCamIVA>",
    textEl("iAfecIVA", "1"),
    textEl("dDesAfecIVA", XSD_DES_AFEC_GRAVADO),
    textEl("dPropIVA", 100),
    textEl("dTasaIVA", 10),
    textEl("dBasGravIVA", baseGrav),
    textEl("dLiqIVAItem", dLiq),
    textEl("dBasExe", 0),
    "</gCamIVA>",
    "</gCamItem>",
  ].join("");

  const totParts: string[] = ["<gTotSub>"];
  totParts.push(textEl("dSub10", dTotOpeItem));
  totParts.push(
    textEl("dTotOpe", dTotOpeItem),
    textEl("dTotDesc", "0"),
    textEl("dTotDescGlotem", "0"),
    textEl("dTotAntItem", "0"),
    textEl("dTotAnt", "0"),
    textEl("dPorcDescTotal", "0"),
    textEl("dDescTotal", "0"),
    textEl("dAnticipo", "0"),
    textEl("dRedon", montoRedondeo(0)),
    textEl("dTotGralOpe", dTotOpeItem)
  );
  totParts.push(textEl("dIVA10", dLiq));
  totParts.push(textEl("dBaseGrav10", baseGrav));
  totParts.push(textEl("dTBasGraIVA", baseGrav));
  totParts.push(textEl("dTotIVA", dLiq));
  totParts.push("</gTotSub>");

  const gCamCondXml = [
    "<gCamCond>",
    textEl("iCondOpe", "1"),
    textEl("dDCondOpe", "Contado"),
    "<gPaConEIni>",
    textEl("iTiPago", "1"),
    textEl("dDesTiPag", "Efectivo"),
    textEl("dMonTiPag", dTotOpeItem),
    textEl("cMoneTiPag", "PYG"),
    textEl("dDMoneTiPag", XSD_DES_MONE_PYG),
    "</gPaConEIni>",
    "</gCamCond>",
  ].join("");

  const gCamNCDE = ["<gCamNCDE>", textEl("iMotEmi", iMotEmi), textEl("dDesMotEmi", dDesMotEmi), "</gCamNCDE>"].join("");

  const gCamDEAsoc = [
    "<gCamDEAsoc>",
    textEl("iTipDocAso", "1"),
    textEl("dDesTipDocAso", "Electrónico"),
    textEl("dCdCDERef", documentoElectronicoOrigen.cdc.trim()),
    "</gCamDEAsoc>",
  ].join("");

  const deInner = [
    textEl("dDVId", dDVId),
    textEl("dFecFirma", dFecFirma),
    textEl("dSisFact", "1"),
    "<gOpeDE>",
    textEl("iTipEmi", "1"),
    textEl("dDesTipEmi", "Normal"),
    textEl("dCodSeg", dCodSeg),
    "</gOpeDE>",
    "<gTimb>",
    textEl("iTiDE", "5"),
    textEl("dDesTiDE", XSD_DES_TI_DE_NCE),
    textEl("dNumTim", dNumTim),
    textEl("dEst", dEst),
    textEl("dPunExp", dPunExp),
    textEl("dNumDoc", dNumDoc),
    textEl("dFeIniT", dFeIniT),
    "</gTimb>",
    "<gDatGralOpe>",
    textEl("dFeEmiDE", dFeEmiDE),
    "<gOpeCom>",
    textEl("iTipTra", "1"),
    textEl("dDesTipTra", XSD_DES_TIP_TRA_VENTA_MERC),
    textEl("iTImp", "1"),
    textEl("dDesTImp", XSD_DES_T_IMP_IVA),
    textEl("cMoneOpe", "PYG"),
    textEl("dDesMoneOpe", XSD_DES_MONE_PYG),
    "</gOpeCom>",
    ...gEmisParts,
    ...recParts,
    "</gDatGralOpe>",
    "<gDtipDE>",
    gCamNCDE,
    gCamCondXml,
    itemXml,
    "</gDtipDE>",
    ...totParts,
    gCamDEAsoc,
  ].join("");

  const de = `<DE Id="${escapeXml(cdc)}">${deInner}</DE>`;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rDE xmlns="${NS}" xmlns:xsi="${XMLNS_XSI}" xsi:schemaLocation="${escapeXml(RDE_XSI_SCHEMA_LOCATION)}">` +
    textEl("dVerFor", "150") +
    de +
    `</rDE>\n`
  );
}
