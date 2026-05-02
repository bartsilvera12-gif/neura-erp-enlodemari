"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSorteoById, updateSorteo } from "@/lib/sorteos/actions";
import type { SorteoEstado, SorteoTicketDeliveryMode } from "@/lib/sorteos/types";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { normalizeTicketImageConfig } from "@/lib/sorteos/sorteo-ticket-types";

const SORTEO_TICKET_ASSETS_BUCKET = "sorteo-ticket-assets";
const MAX_ASSET_BYTES = 4 * 1024 * 1024;
const ASSET_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

function publicTicketAssetUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
  const seg = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${SORTEO_TICKET_ASSETS_BUCKET}/${seg}`;
}

function buildTicketImagePayload(
  base: Record<string, unknown>,
  text: { title: string; caption: string; legal: string; stub: string }
): Record<string, unknown> {
  const ticketMerged: Record<string, unknown> = {
    showLogo: true,
    showClienteNombre: true,
    showDocumento: true,
    showTelefono: true,
    showNumeroOrden: true,
    showCupones: true,
    showSorteoNombre: true,
    primaryColor: "#0f172a",
    secondaryColor: "#64748b",
    backgroundColor: "#f8fafc",
    ...base,
  };
  const tit = text.title.trim();
  const cap = text.caption.trim();
  const leg = text.legal.trim();
  const stu = text.stub.trim();
  if (tit) ticketMerged.title = tit;
  else delete ticketMerged.title;
  if (cap) ticketMerged.caption = cap;
  else delete ticketMerged.caption;
  if (leg) ticketMerged.legalFooter = leg;
  else delete ticketMerged.legalFooter;
  if (stu) ticketMerged.ticket_image_only_stub = stu;
  else delete ticketMerged.ticket_image_only_stub;
  return ticketMerged;
}

function validateAssetFile(f: File): string | null {
  const mime = (f.type || "").toLowerCase();
  if (!ASSET_MIME.has(mime)) {
    return "Solo se admiten PNG, JPG o WebP.";
  }
  if (f.size > MAX_ASSET_BYTES) {
    return `El archivo supera el máximo de ${MAX_ASSET_BYTES / (1024 * 1024)} MB.`;
  }
  if (f.size < 1) {
    return "El archivo está vacío.";
  }
  return null;
}

/** Encadena intentos de carga de imagen pública (bucket público). */
function probePublicImage(urls: string[], onFound: (url: string) => void, onDone?: () => void) {
  if (urls.length === 0) {
    onDone?.();
    return;
  }
  const [first, ...rest] = urls;
  const img = new Image();
  img.onload = () => {
    onFound(first);
    onDone?.();
  };
  img.onerror = () => probePublicImage(rest, onFound, onDone);
  img.src = first;
}

export default function EditarSorteoPage() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const router = useRouter();
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [precio, setPrecio] = useState(0);
  const [maxBoletos, setMaxBoletos] = useState(100);
  const [fechaSorteo, setFechaSorteo] = useState("");
  const [estado, setEstado] = useState<SorteoEstado>("activo");
  const [imagenUrl, setImagenUrl] = useState("");
  const [datosBancarios, setDatosBancarios] = useState("{}");
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [ticketDeliveryMode, setTicketDeliveryMode] = useState<SorteoTicketDeliveryMode>("text_only");
  const [ticketCaption, setTicketCaption] = useState("");
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketLegal, setTicketLegal] = useState("");
  const [ticketStub, setTicketStub] = useState("");
  /** Resto de claves de ticket_image_config (colores, show*, paths de storage). */
  const [ticketImageConfigBase, setTicketImageConfigBase] = useState<Record<string, unknown>>({});
  const ticketCfgRef = useRef<Record<string, unknown>>({});
  ticketCfgRef.current = ticketImageConfigBase;

  /** Preview por archivo existente en Storage sin fila en config (legado). */
  const [legacyLogoUrl, setLegacyLogoUrl] = useState<string | null>(null);
  const [legacyBgUrl, setLegacyBgUrl] = useState<string | null>(null);

  type AssetPhase = "idle" | "uploading" | "ok" | "error";
  const [logoPickName, setLogoPickName] = useState<string | null>(null);
  const [logoObjectUrl, setLogoObjectUrl] = useState<string | null>(null);
  const [logoPhase, setLogoPhase] = useState<AssetPhase>("idle");
  const [logoMsg, setLogoMsg] = useState<string | null>(null);

  const [bgPickName, setBgPickName] = useState<string | null>(null);
  const [bgObjectUrl, setBgObjectUrl] = useState<string | null>(null);
  const [bgPhase, setBgPhase] = useState<AssetPhase>("idle");
  const [bgMsg, setBgMsg] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const textFields = useCallback(
    () => ({
      title: ticketTitle,
      caption: ticketCaption,
      legal: ticketLegal,
      stub: ticketStub,
    }),
    [ticketTitle, ticketCaption, ticketLegal, ticketStub]
  );

  const persistTicketConfig = useCallback(
    async (nextBase: Record<string, unknown>) => {
      const ticketMerged = buildTicketImagePayload(nextBase, textFields());
      const res = await fetchWithSupabaseSession(`/api/sorteos/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_image_config: ticketMerged }),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(raw || `${res.status}`);
      let json: { success?: boolean; data?: { ticket_image_config?: Record<string, unknown> } };
      try {
        json = JSON.parse(raw) as { success?: boolean; data?: { ticket_image_config?: Record<string, unknown> } };
      } catch {
        throw new Error("Respuesta inválida del servidor.");
      }
      if (json.success && json.data?.ticket_image_config && typeof json.data.ticket_image_config === "object") {
        setTicketImageConfigBase({ ...json.data.ticket_image_config });
      }
    },
    [id, textFields]
  );

  useEffect(() => {
    if (!id) return;
    getSorteoById(id)
      .then((s) => {
        if (!s) {
          setError("Sorteo no encontrado");
          return;
        }
        setEmpresaId(s.empresa_id);
        setNombre(s.nombre);
        setDescripcion(s.descripcion ?? "");
        setPrecio(s.precio_por_boleto);
        setMaxBoletos(s.max_boletos);
        if (s.fecha_sorteo) {
          const d = new Date(s.fecha_sorteo);
          const pad = (n: number) => String(n).padStart(2, "0");
          setFechaSorteo(
            `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
          );
        }
        setEstado(s.estado);
        setImagenUrl(s.imagen_url ?? "");
        setDatosBancarios(JSON.stringify(s.datos_bancarios ?? {}, null, 2));
        setTicketDeliveryMode((s.ticket_delivery_mode as SorteoTicketDeliveryMode) ?? "text_only");
        const tic = normalizeTicketImageConfig(s.ticket_image_config);
        setTicketImageConfigBase(
          s.ticket_image_config &&
            typeof s.ticket_image_config === "object" &&
            s.ticket_image_config !== null &&
            !Array.isArray(s.ticket_image_config)
            ? { ...(s.ticket_image_config as Record<string, unknown>) }
            : {}
        );
        setTicketTitle(typeof tic.title === "string" ? tic.title : "");
        setTicketCaption(typeof tic.caption === "string" ? tic.caption : "");
        setTicketLegal(typeof tic.legalFooter === "string" ? tic.legalFooter : "");
        setTicketStub(typeof tic.ticket_image_only_stub === "string" ? tic.ticket_image_only_stub : "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setCargando(false));
  }, [id]);

  const depLogoPath =
    typeof ticketImageConfigBase.logo_storage_path === "string" ? ticketImageConfigBase.logo_storage_path : "";
  const depBgPath =
    typeof ticketImageConfigBase.background_storage_path === "string"
      ? ticketImageConfigBase.background_storage_path
      : "";

  useEffect(() => {
    if (!empresaId || !id) return;
    const base = `${empresaId}/${id}`;
    if (depLogoPath) {
      setLegacyLogoUrl(null);
      return;
    }
    const logoUrls = [`${base}/logo.png`, `${base}/logo.webp`, `${base}/logo.jpg`].map(publicTicketAssetUrl);
    setLegacyLogoUrl(null);
    probePublicImage(logoUrls, (u) => setLegacyLogoUrl(u));
  }, [empresaId, id, depLogoPath]);

  useEffect(() => {
    if (!empresaId || !id) return;
    const base = `${empresaId}/${id}`;
    if (depBgPath) {
      setLegacyBgUrl(null);
      return;
    }
    const urls = [`${base}/background.png`, `${base}/background.webp`, `${base}/background.jpg`].map(
      publicTicketAssetUrl
    );
    setLegacyBgUrl(null);
    probePublicImage(urls, (u) => setLegacyBgUrl(u));
  }, [empresaId, id, depBgPath]);

  useEffect(() => {
    return () => {
      if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
      if (bgObjectUrl) URL.revokeObjectURL(bgObjectUrl);
    };
  }, [logoObjectUrl, bgObjectUrl]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const nombreTrim = nombre.trim();
    if (!nombreTrim) {
      setError("El nombre del sorteo es obligatorio.");
      return;
    }
    if (!Number.isFinite(precio) || precio < 0) {
      setError("El precio por boleto debe ser un número válido mayor o igual a 0.");
      return;
    }
    if (!Number.isFinite(maxBoletos) || maxBoletos < 1) {
      setError("El máximo de boletos debe ser al menos 1.");
      return;
    }

    let json: Record<string, unknown> = {};
    try {
      json = datosBancarios.trim() ? (JSON.parse(datosBancarios) as Record<string, unknown>) : {};
    } catch {
      setError("Datos bancarios: el JSON no es válido. Revisá comillas y comas.");
      return;
    }

    let fechaIso: string | null = null;
    if (fechaSorteo.trim()) {
      const d = new Date(fechaSorteo);
      if (Number.isNaN(d.getTime())) {
        setError("La fecha del sorteo no es válida.");
        return;
      }
      fechaIso = d.toISOString();
    }

    const ticketMerged = buildTicketImagePayload(ticketImageConfigBase, textFields());

    setGuardando(true);
    try {
      const updated = await updateSorteo(id, {
        nombre: nombreTrim,
        descripcion,
        precio_por_boleto: precio,
        max_boletos: maxBoletos,
        fecha_sorteo: fechaIso,
        estado,
        datos_bancarios: json,
        imagen_url: imagenUrl.trim() || null,
        ticket_delivery_mode: ticketDeliveryMode,
        ticket_image_config: ticketMerged,
      });
      if (updated.ticket_image_config && typeof updated.ticket_image_config === "object") {
        setTicketImageConfigBase({ ...(updated.ticket_image_config as Record<string, unknown>) });
      }
      setSuccess("Cambios guardados correctamente.");
      router.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al guardar";
      setError(msg);
      console.error("[editar sorteo]", err);
    } finally {
      setGuardando(false);
    }
  }

  async function onLogoFile(files: FileList | null) {
    const f = files?.[0];
    if (!f || !id) return;
    setLogoMsg(null);
    setLogoPhase("idle");
    const err = validateAssetFile(f);
    if (err) {
      setLogoPhase("error");
      setLogoMsg(err);
      return;
    }
    if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
    const ou = URL.createObjectURL(f);
    setLogoObjectUrl(ou);
    setLogoPickName(f.name);
    setLogoPhase("uploading");

    const fd = new FormData();
    fd.set("sorteo_id", id);
    fd.set("kind", "logo");
    fd.set("file", f);
    try {
      const res = await fetchWithSupabaseSession("/api/sorteos/ticket-assets", {
        method: "POST",
        body: fd,
      });
      const raw = await res.text();
      if (!res.ok) {
        setLogoPhase("error");
        setLogoMsg(raw || `Error ${res.status}`);
        return;
      }
      const json = JSON.parse(raw) as { success?: boolean; data?: { bucket?: string; path?: string } };
      const bucket = json.data?.bucket;
      const path = json.data?.path;
      if (!json.success || !bucket || !path) {
        setLogoPhase("error");
        setLogoMsg("Respuesta inválida del servidor.");
        return;
      }
      const nextBase = {
        ...ticketCfgRef.current,
        logo_storage_bucket: bucket,
        logo_storage_path: path,
      };
      await persistTicketConfig(nextBase);
      if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
      setLogoObjectUrl(null);
      setLogoPickName(null);
      setLegacyLogoUrl(null);
      setLogoPhase("ok");
      setLogoMsg("Logo cargado correctamente.");
    } catch (e) {
      setLogoPhase("error");
      setLogoMsg(e instanceof Error ? e.message : "Error al subir");
    }
  }

  async function onBgFile(files: FileList | null) {
    const f = files?.[0];
    if (!f || !id) return;
    setBgMsg(null);
    setBgPhase("idle");
    const err = validateAssetFile(f);
    if (err) {
      setBgPhase("error");
      setBgMsg(err);
      return;
    }
    if (bgObjectUrl) URL.revokeObjectURL(bgObjectUrl);
    const ou = URL.createObjectURL(f);
    setBgObjectUrl(ou);
    setBgPickName(f.name);
    setBgPhase("uploading");

    const fd = new FormData();
    fd.set("sorteo_id", id);
    fd.set("kind", "background");
    fd.set("file", f);
    try {
      const res = await fetchWithSupabaseSession("/api/sorteos/ticket-assets", {
        method: "POST",
        body: fd,
      });
      const raw = await res.text();
      if (!res.ok) {
        setBgPhase("error");
        setBgMsg(raw || `Error ${res.status}`);
        return;
      }
      const json = JSON.parse(raw) as { success?: boolean; data?: { bucket?: string; path?: string } };
      const bucket = json.data?.bucket;
      const path = json.data?.path;
      if (!json.success || !bucket || !path) {
        setBgPhase("error");
        setBgMsg("Respuesta inválida del servidor.");
        return;
      }
      const nextBase = {
        ...ticketCfgRef.current,
        background_storage_bucket: bucket,
        background_storage_path: path,
      };
      await persistTicketConfig(nextBase);
      if (bgObjectUrl) URL.revokeObjectURL(bgObjectUrl);
      setBgObjectUrl(null);
      setBgPickName(null);
      setLegacyBgUrl(null);
      setBgPhase("ok");
      setBgMsg("Fondo cargado correctamente.");
    } catch (e) {
      setBgPhase("error");
      setBgMsg(e instanceof Error ? e.message : "Error al subir");
    }
  }

  async function removeLogo() {
    if (!id) return;
    setLogoMsg(null);
    try {
      const res = await fetchWithSupabaseSession(
        `/api/sorteos/ticket-assets?sorteo_id=${encodeURIComponent(id)}&kind=logo`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        setLogoPhase("error");
        setLogoMsg(await res.text());
        return;
      }
      const next = { ...ticketCfgRef.current };
      delete next.logo_storage_bucket;
      delete next.logo_storage_path;
      await persistTicketConfig(next);
      setLegacyLogoUrl(null);
      setLogoPhase("idle");
      setLogoMsg("Logo quitado. Podés subir uno nuevo cuando quieras.");
    } catch (e) {
      setLogoPhase("error");
      setLogoMsg(e instanceof Error ? e.message : "Error");
    }
  }

  async function removeBackground() {
    if (!id) return;
    setBgMsg(null);
    try {
      const res = await fetchWithSupabaseSession(
        `/api/sorteos/ticket-assets?sorteo_id=${encodeURIComponent(id)}&kind=background`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        setBgPhase("error");
        setBgMsg(await res.text());
        return;
      }
      const next = { ...ticketCfgRef.current };
      delete next.background_storage_bucket;
      delete next.background_storage_path;
      await persistTicketConfig(next);
      setLegacyBgUrl(null);
      setBgPhase("idle");
      setBgMsg("Fondo quitado.");
    } catch (e) {
      setBgPhase("error");
      setBgMsg(e instanceof Error ? e.message : "Error");
    }
  }

  const logoPathStored =
    typeof ticketImageConfigBase.logo_storage_path === "string" ? ticketImageConfigBase.logo_storage_path : null;
  const bgPathStored =
    typeof ticketImageConfigBase.background_storage_path === "string"
      ? ticketImageConfigBase.background_storage_path
      : null;

  const logoPreviewSrc = logoObjectUrl
    ? logoObjectUrl
    : logoPathStored
      ? publicTicketAssetUrl(logoPathStored)
      : legacyLogoUrl;
  const bgPreviewSrc = bgObjectUrl ? bgObjectUrl : bgPathStored ? publicTicketAssetUrl(bgPathStored) : legacyBgUrl;

  const hasLogoOnServer = Boolean(logoPathStored || legacyLogoUrl);
  const hasBgOnServer = Boolean(bgPathStored || legacyBgUrl);

  if (cargando) {
    return <div className="py-16 text-center text-slate-400 text-sm animate-pulse">Cargando…</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/sorteos" className="hover:text-slate-800">
          Sorteos
        </Link>
        <span>/</span>
        <span className="text-slate-800 font-medium">Editar</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-800">Editar sorteo</h1>
      <div className="pt-1 flex flex-wrap gap-2">
        <Link
          href={`/configuracion/conversaciones/flujos?sorteo_id=${encodeURIComponent(id)}`}
          className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
        >
          Flujo WhatsApp para este sorteo
        </Link>
        <Link
          href={`/sorteos/${id}/revendedores`}
          className="inline-flex items-center rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100"
        >
          Revendedores y enlaces de referido
        </Link>
        <Link
          href="/sorteos/tickets"
          className="inline-flex items-center rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 hover:bg-violet-100"
        >
          Tickets / Comprobantes
        </Link>
      </div>
      <p className="text-sm text-slate-600 max-w-3xl">
        El botón <strong className="font-medium text-slate-800">Tickets / Comprobantes</strong> abre el reservorio de
        envíos. La <strong className="font-medium text-slate-800">configuración del ticket</strong> (modo, texto, logo y
        fondo) está en esta misma página, en la sección{" "}
        <a href="#respuesta-ticket" className="text-violet-700 underline underline-offset-2">
          Respuesta al comprador / Ticket
        </a>
        .
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-2" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div
          className="bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-lg px-4 py-2"
          role="status"
        >
          {success}{" "}
          <Link href="/sorteos" className="font-medium text-emerald-800 underline underline-offset-2">
            Ver listado de sorteos
          </Link>
        </div>
      )}

      <form noValidate onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2">Datos del sorteo</h2>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[80px]"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Precio por boleto (₲)</label>
              <input
                type="number"
                min={0}
                step={1}
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={precio}
                onChange={(e) => setPrecio(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Máx. boletos</label>
              <input
                type="number"
                min={1}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={Number.isFinite(maxBoletos) ? maxBoletos : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setMaxBoletos(v === "" ? 0 : Number(v));
                }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fecha del sorteo</label>
              <input
                type="datetime-local"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={fechaSorteo}
                onChange={(e) => setFechaSorteo(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={estado}
                onChange={(e) => setEstado(e.target.value as SorteoEstado)}
              >
                <option value="activo">activo</option>
                <option value="pausado">pausado</option>
                <option value="cerrado">cerrado</option>
                <option value="finalizado">finalizado</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">URL imagen</label>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={imagenUrl}
              onChange={(e) => setImagenUrl(e.target.value)}
            />
          </div>
        </section>

        <section
          id="respuesta-ticket"
          className="rounded-xl border-2 border-violet-300 bg-gradient-to-b from-violet-50/90 to-white p-6 shadow-md space-y-4 scroll-mt-6"
        >
          <div>
            <h2 className="text-base font-semibold text-slate-900">Respuesta al comprador / Ticket</h2>
            <p className="text-xs text-slate-600 mt-1">
              Define cómo responde el sistema tras la compra en WhatsApp: solo texto, texto más imagen del ticket, o solo
              imagen. Los archivos de logo y fondo se suben a Storage al elegir archivo; los textos y modo se guardan con{" "}
              <span className="font-medium">Guardar</span> o al terminar la subida del asset (se actualiza{" "}
              <code className="rounded bg-violet-100/80 px-1">ticket_image_config</code>).
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Modo de respuesta</label>
            <select
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
              value={ticketDeliveryMode}
              onChange={(e) => setTicketDeliveryMode(e.target.value as SorteoTicketDeliveryMode)}
            >
              <option value="text_only">Solo mensaje de texto (sin ticket PNG)</option>
              <option value="text_and_image">Texto + ticket en imagen</option>
              <option value="image_only">Solo ticket en imagen</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-600 mb-1">Título en el ticket</label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={ticketTitle}
                onChange={(e) => setTicketTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Caption WhatsApp (imagen)</label>
              <input
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={ticketCaption}
                onChange={(e) => setTicketCaption(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Texto legal / pie</label>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={ticketLegal}
              onChange={(e) => setTicketLegal(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">
              Texto corto (solo ticket imagen — opcional)
            </label>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={ticketStub}
              onChange={(e) => setTicketStub(e.target.value)}
              placeholder="Listo, generamos tu comprobante…"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Logo uploader */}
            <div className="rounded-xl border border-dashed border-violet-300 bg-white/90 p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Subir logo del sorteo</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    PNG, JPG o WebP. Recomendado: fondo transparente. Máx. {MAX_ASSET_BYTES / (1024 * 1024)} MB.
                  </p>
                </div>
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => {
                  void onLogoFile(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoPhase === "uploading"}
                  className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {hasLogoOnServer ? "Cambiar logo" : "Seleccionar logo"}
                </button>
                {hasLogoOnServer && (
                  <button
                    type="button"
                    onClick={() => void removeLogo()}
                    className="text-sm text-red-700 hover:underline"
                  >
                    Quitar logo
                  </button>
                )}
              </div>
              {logoPathStored && (
                <p className="text-xs text-emerald-800 font-medium">Hay un logo guardado en Storage (registrado en el sorteo).</p>
              )}
              {!logoPathStored && legacyLogoUrl && (
                <p className="text-xs text-amber-800">Hay un archivo de logo en Storage (subida anterior sin registro en config).</p>
              )}
              {!hasLogoOnServer && !logoPickName && logoPhase !== "uploading" && (
                <p className="text-xs text-slate-500">Aún no cargaste un logo.</p>
              )}
              {logoPickName && (
                <p className="text-xs text-slate-700">
                  Archivo: <span className="font-medium break-all">{logoPickName}</span>
                </p>
              )}
              {logoPhase === "uploading" && (
                <p className="text-xs font-medium text-violet-800">Subiendo logo…</p>
              )}
              {logoPhase === "ok" && logoMsg && (
                <p className="text-xs font-medium text-emerald-800">{logoMsg}</p>
              )}
              {logoPhase === "error" && logoMsg && (
                <p className="text-xs text-red-700" role="alert">
                  {logoMsg}
                </p>
              )}
              <div className="flex items-center gap-3">
                <div
                  className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center text-[10px] text-slate-400 text-center p-1"
                  aria-hidden={!logoPreviewSrc}
                >
                  {logoPreviewSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoPreviewSrc} alt="" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span>Sin preview</span>
                  )}
                </div>
                <span className="text-xs text-slate-500">Vista previa 80×80</span>
              </div>
            </div>

            {/* Background uploader */}
            <div className="rounded-xl border border-dashed border-violet-300 bg-white/90 p-4 flex flex-col gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Subir fondo del ticket</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Opcional. PNG, JPG o WebP. Máx. {MAX_ASSET_BYTES / (1024 * 1024)} MB.
                </p>
              </div>
              <input
                ref={bgInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => {
                  void onBgFile(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => bgInputRef.current?.click()}
                  disabled={bgPhase === "uploading"}
                  className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {hasBgOnServer ? "Cambiar fondo" : "Seleccionar fondo"}
                </button>
                {hasBgOnServer && (
                  <button
                    type="button"
                    onClick={() => void removeBackground()}
                    className="text-sm text-red-700 hover:underline"
                  >
                    Quitar fondo
                  </button>
                )}
              </div>
              {bgPathStored && (
                <p className="text-xs text-emerald-800 font-medium">Fondo cargado y registrado en el sorteo.</p>
              )}
              {!bgPathStored && legacyBgUrl && (
                <p className="text-xs text-amber-800">Hay un fondo en Storage (subida anterior sin registro en config).</p>
              )}
              {!hasBgOnServer && !bgPickName && bgPhase !== "uploading" && (
                <p className="text-xs text-slate-500">Sin fondo personalizado (se usa el color de fondo del diseño).</p>
              )}
              {bgPickName && (
                <p className="text-xs text-slate-700">
                  Archivo: <span className="font-medium break-all">{bgPickName}</span>
                </p>
              )}
              {bgPhase === "uploading" && <p className="text-xs font-medium text-violet-800">Subiendo fondo…</p>}
              {bgPhase === "ok" && bgMsg && <p className="text-xs font-medium text-emerald-800">{bgMsg}</p>}
              {bgPhase === "error" && bgMsg && (
                <p className="text-xs text-red-700" role="alert">
                  {bgMsg}
                </p>
              )}
              <div
                className="h-20 max-w-[200px] overflow-hidden rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center text-[10px] text-slate-400 text-center px-2"
              >
                {bgPreviewSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={bgPreviewSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span>Sin preview</span>
                )}
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-600 border-t border-violet-200/80 pt-3">
            Al guardar el formulario completo, también persistís modo de envío y textos. Podés revisar envíos en el
            reservorio <strong>Tickets / Comprobantes</strong>.
          </p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2">Datos bancarios</h2>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Datos bancarios (JSON)</label>
            <textarea
              className="w-full font-mono text-xs border border-slate-200 rounded-lg px-3 py-2 min-h-[100px]"
              value={datosBancarios}
              onChange={(e) => setDatosBancarios(e.target.value)}
            />
          </div>
        </section>
        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={guardando}
            className="bg-[#0EA5E9] hover:bg-[#0284C7] disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          <Link href="/sorteos" className="px-5 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
            Volver
          </Link>
        </div>
      </form>
    </div>
  );
}
