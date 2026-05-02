import "server-only";

import { createHash } from "node:crypto";
import type { SorteoTicketImageConfig } from "@/lib/sorteos/sorteo-ticket-types";

export type SorteoTicketRenderInput = {
  empresaNombre: string;
  sorteoNombre: string;
  clienteNombre?: string;
  documento?: string;
  telefono?: string;
  numeroOrden: string;
  cupones: string[];
  /** ISO o texto localizable */
  fechaHora: string;
  config: SorteoTicketImageConfig;
  /** bytes PNG/JPEG/WebP o null */
  logoBytes: Buffer | null;
  logoMime: string | null;
  backgroundBytes: Buffer | null;
  backgroundMime: string | null;
};

const W = 720;
const H = 1280;
const M = 36;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0]! + p[p.length - 1]![0]!).toUpperCase();
}

/** Hasta 6: lista grande; 7–20: grilla; >20: primeros 20 + leyenda */
function formatCuponBlocks(cupones: string[]): { body: string; extraLine: string | null } {
  const n = cupones.length;
  if (n === 0) {
    return { body: `<text x="${M}" y="420" font-size="22" fill="#334155">—</text>`, extraLine: null };
  }
  if (n <= 6) {
    let y = 400;
    const parts: string[] = [];
    for (const c of cupones) {
      parts.push(
        `<text x="${M}" y="${y}" font-size="28" font-weight="600" fill="#0f172a">${esc(c)}</text>`
      );
      y += 40;
    }
    return { body: parts.join("\n"), extraLine: null };
  }
  if (n <= 20) {
    const cols = 2;
    const cellW = (W - M * 2) / cols;
    let row = 0;
    let col = 0;
    const parts: string[] = [];
    for (const c of cupones) {
      const x = M + col * cellW;
      const y = 380 + row * 34;
      parts.push(`<text x="${x}" y="${y}" font-size="15" font-weight="600" fill="#0f172a">${esc(c)}</text>`);
      col++;
      if (col >= cols) {
        col = 0;
        row++;
      }
    }
    return { body: parts.join("\n"), extraLine: null };
  }
  const shown = cupones.slice(0, 20);
  const rest = n - 20;
  const inner = formatCuponBlocks(shown);
  return {
    body: inner.body,
    extraLine: `+${rest} cupones adicionales. Ver listado completo en el mensaje o reservorio.`,
  };
}

function dataUrlFromBuffer(buf: Buffer, mime: string): string {
  const b64 = buf.toString("base64");
  return `data:${mime};base64,${b64}`;
}

export function buildSorteoTicketSvg(input: SorteoTicketRenderInput): string {
  const cfg = input.config;
  const bg = (cfg.backgroundColor ?? "#f8fafc").trim();
  const primary = (cfg.primaryColor ?? "#0f172a").trim();
  const secondary = (cfg.secondaryColor ?? "#64748b").trim();
  const title = (cfg.title ?? "Comprobante de participación").trim();
  const footer = (cfg.legalFooter ?? "").trim();

  const showLogo = cfg.showLogo !== false;
  const showNombre = cfg.showClienteNombre !== false;
  const showDoc = cfg.showDocumento !== false;
  const showTel = cfg.showTelefono !== false;
  const showOrd = cfg.showNumeroOrden !== false;
  const showCup = cfg.showCupones !== false;
  const showSorteoNom = cfg.showSorteoNombre !== false;

  let logoBlock = "";
  if (showLogo) {
    if (input.logoBytes && input.logoMime) {
      const href = dataUrlFromBuffer(input.logoBytes, input.logoMime);
      logoBlock = `<image href="${href}" x="${M}" y="${M}" width="120" height="120" preserveAspectRatio="xMidYMid meet"/>`;
    } else {
      const ini = initials(input.clienteNombre || input.empresaNombre);
      logoBlock = `<rect x="${M}" y="${M}" width="120" height="120" rx="16" fill="#e2e8f0"/><text x="${M + 60}" y="${M + 78}" text-anchor="middle" font-size="36" font-weight="700" fill="#475569">${esc(
        ini
      )}</text>`;
    }
  }

  let bgImg = "";
  if (input.backgroundBytes && input.backgroundMime) {
    const href = dataUrlFromBuffer(input.backgroundBytes, input.backgroundMime);
    bgImg = `<image href="${href}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" opacity="0.18"/>`;
  }

  const metaLines: string[] = [];
  if (showNombre && input.clienteNombre?.trim())
    metaLines.push(`Cliente: ${input.clienteNombre.trim()}`);
  if (showDoc && input.documento?.trim()) metaLines.push(`Doc.: ${input.documento.trim()}`);
  if (showTel && input.telefono?.trim()) metaLines.push(`Tel.: ${input.telefono.trim()}`);
  if (showOrd) metaLines.push(`Orden Nº ${input.numeroOrden}`);
  if (showSorteoNom) metaLines.push(`Sorteo: ${input.sorteoNombre}`);

  const cupones = showCup ? input.cupones : [];
  const cupBlock = formatCuponBlocks(cupones);

  let yMeta = 200;
  const metaSvg = metaLines
    .map((t) => {
      const line = `<text x="${M}" y="${yMeta}" font-size="20" fill="${secondary}">${esc(t)}</text>`;
      yMeta += 28;
      return line;
    })
    .join("\n");

  const extraY = yMeta + 180;
  const extraSvg = cupBlock.extraLine
    ? `<text x="${M}" y="${extraY}" font-size="16" fill="${secondary}">${esc(cupBlock.extraLine)}</text>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  ${bgImg}
  ${logoBlock}
  <text x="${M + (showLogo ? 140 : 0)}" y="${M + 48}" font-size="26" font-weight="700" fill="${primary}">${esc(
    input.empresaNombre
  )}</text>
  <text x="${M}" y="${M + 170}" font-size="22" font-weight="600" fill="${primary}">${esc(title)}</text>
  ${metaSvg}
  <text x="${M}" y="${320}" font-size="18" fill="${secondary}">Cupones (${cupones.length})</text>
  ${cupBlock.body}
  ${extraSvg}
  <text x="${M}" y="${H - M - 40}" font-size="15" fill="${secondary}">${esc(input.fechaHora)}</text>
  ${
    footer
      ? `<text x="${M}" y="${H - M - 10}" font-size="12" fill="${secondary}">${esc(footer)}</text>`
      : ""
  }
</svg>`;
}

export async function renderSorteoTicketPng(svg: string): Promise<{ png: Buffer; hash: string }> {
  const sharpMod = (await import("sharp")).default;
  const png = await sharpMod(Buffer.from(svg, "utf8")).png({ compressionLevel: 9 }).toBuffer();
  const hash = createHash("sha256").update(png).digest("hex");
  return { png, hash };
}
