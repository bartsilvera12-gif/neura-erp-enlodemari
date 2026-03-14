import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import type { Prospecto, Nota, EtapaFunnel } from "./types";

// ─── Tipos de fila Supabase ───────────────────────────────────────────────────

interface ProspectoRow {
  id: string;
  empresa_id: string;
  numero_control: string;
  empresa: string;
  contacto: string;
  email: string | null;
  telefono: string | null;
  servicio: string;
  valor_estimado: number;
  etapa: string;
  proxima_accion: string | null;
  fecha_proxima_accion: string | null;
  creado_por: string | null;
  origen_creacion?: string | null;
  responsable: string | null;
  cliente_creado: boolean;
  fecha_creacion: string;
  fecha_actualizacion: string;
}

interface NotaRow {
  id: string;
  empresa_id: string;
  prospecto_id: string;
  texto: string;
  fecha: string;
}

// ─── Mapeo fila → tipo ────────────────────────────────────────────────────────

function rowToNota(row: NotaRow): Nota {
  return {
    id: row.id,
    texto: row.texto,
    fecha: row.fecha,
  };
}

function rowToProspecto(row: ProspectoRow, notas: Nota[]): Prospecto {
  return {
    id: row.id,
    numero_control: row.numero_control,
    empresa: row.empresa,
    contacto: row.contacto,
    email: row.email ?? undefined,
    telefono: row.telefono ?? undefined,
    servicio: row.servicio,
    valor_estimado: Number(row.valor_estimado),
    etapa: row.etapa as EtapaFunnel,
    proxima_accion: row.proxima_accion ?? undefined,
    fecha_proxima_accion: row.fecha_proxima_accion ?? undefined,
    creado_por: row.creado_por ?? undefined,
    origen_creacion: (row.origen_creacion === "whatsapp" ? "whatsapp" : "manual") as "manual" | "whatsapp",
    responsable: row.responsable ?? undefined,
    notas,
    fecha_creacion: row.fecha_creacion,
    fecha_actualizacion: row.fecha_actualizacion,
    cliente_creado: row.cliente_creado,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function generarNumeroControl(): Promise<string> {
  const { data } = await supabase
    .from("crm_prospectos")
    .select("numero_control")
    .order("created_at", { ascending: false })
    .limit(1);

  const last = data?.[0] as { numero_control?: string } | undefined;
  const match = last?.numero_control?.match(/CRM-(\d+)/);
  const next = (parseInt(match?.[1] ?? "0") + 1);
  return `CRM-${String(next).padStart(6, "0")}`;
}

// ─── Prospectos ────────────────────────────────────────────────────────────────

/** Lista prospectos con sus notas. RLS filtra por empresa. */
export async function getProspectos(): Promise<Prospecto[]> {
  const { data: prospectosData, error: errP } = await supabase
    .from("crm_prospectos")
    .select("*")
    .order("fecha_creacion", { ascending: false });

  if (errP) {
    console.error("[crm] getProspectos:", errP.message);
    return [];
  }

  const prospectos = prospectosData as ProspectoRow[];
  if (prospectos.length === 0) return [];

  const ids = prospectos.map((p) => p.id);
  const { data: notasData, error: errN } = await supabase
    .from("crm_notas")
    .select("*")
    .in("prospecto_id", ids)
    .order("fecha", { ascending: false });

  if (errN) {
    console.error("[crm] getProspectos (notas):", errN.message);
  }

  const notasRows = (notasData as NotaRow[]) ?? [];
  const notasPorProspecto = notasRows.reduce<Record<string, Nota[]>>((acc, n) => {
    if (!acc[n.prospecto_id]) acc[n.prospecto_id] = [];
    acc[n.prospecto_id].unshift(rowToNota(n));
    return acc;
  }, {});

  return prospectos.map((p) =>
    rowToProspecto(p, notasPorProspecto[p.id] ?? [])
  );
}

/** Obtiene un prospecto por ID con sus notas. */
export async function getProspecto(id: string): Promise<Prospecto | null> {
  const { data: pData, error: errP } = await supabase
    .from("crm_prospectos")
    .select("*")
    .eq("id", id)
    .single();

  if (errP || !pData) {
    console.error("[crm] getProspecto:", errP?.message);
    return null;
  }

  const { data: notasData } = await supabase
    .from("crm_notas")
    .select("*")
    .eq("prospecto_id", id)
    .order("fecha", { ascending: false });

  const notas = ((notasData as NotaRow[]) ?? []).map(rowToNota);
  return rowToProspecto(pData as ProspectoRow, notas);
}

export type NuevoProspectoData = Omit<
  Prospecto,
  "id" | "numero_control" | "notas" | "fecha_creacion" | "fecha_actualizacion"
>;

/** Crea prospecto. empresa_id desde getCurrentUser(). */
export async function saveProspecto(
  datos: NuevoProspectoData
): Promise<Prospecto | null> {
  const usuario = await getCurrentUser();
  if (!usuario?.empresa_id) throw new Error("Usuario no autenticado o sin empresa");

  const numeroControl = await generarNumeroControl();
  const creadoPor = (usuario as { nombre?: string; email?: string }).nombre?.trim()
    || (usuario as { email?: string }).email
    || null;

  const insert = {
    empresa_id: usuario.empresa_id,
    numero_control: numeroControl,
    empresa: datos.empresa,
    contacto: datos.contacto,
    email: datos.email ?? null,
    telefono: datos.telefono ?? null,
    servicio: datos.servicio,
    valor_estimado: datos.valor_estimado ?? 0,
    etapa: datos.etapa ?? "LEAD",
    proxima_accion: datos.proxima_accion ?? null,
    fecha_proxima_accion: datos.fecha_proxima_accion ?? null,
    creado_por: creadoPor,
    origen_creacion: "manual",
    responsable: datos.responsable ?? null,
  };

  const { data, error } = await supabase
    .from("crm_prospectos")
    .insert([insert])
    .select()
    .single();

  if (error) {
    console.error("[crm] saveProspecto:", error.message);
    return null;
  }

  return rowToProspecto(data as ProspectoRow, []);
}

/** Actualiza prospecto. */
export async function updateProspecto(
  id: string,
  datos: Partial<Omit<Prospecto, "id" | "numero_control" | "notas" | "fecha_creacion">>
): Promise<Prospecto | null> {
  const patch: Record<string, unknown> = {};
  if (datos.empresa !== undefined) patch.empresa = datos.empresa;
  if (datos.contacto !== undefined) patch.contacto = datos.contacto;
  if (datos.email !== undefined) patch.email = datos.email ?? null;
  if (datos.telefono !== undefined) patch.telefono = datos.telefono ?? null;
  if (datos.servicio !== undefined) patch.servicio = datos.servicio;
  if (datos.valor_estimado !== undefined) patch.valor_estimado = datos.valor_estimado;
  if (datos.etapa !== undefined) patch.etapa = datos.etapa;
  if (datos.proxima_accion !== undefined) patch.proxima_accion = datos.proxima_accion ?? null;
  if (datos.fecha_proxima_accion !== undefined) patch.fecha_proxima_accion = datos.fecha_proxima_accion ?? null;
  // creado_por no se actualiza: queda fijo con quien creó el lead
  if (datos.responsable !== undefined) patch.responsable = datos.responsable ?? null;
  if (datos.cliente_creado !== undefined) patch.cliente_creado = datos.cliente_creado;
  patch.fecha_actualizacion = new Date().toISOString();

  const { data, error } = await supabase
    .from("crm_prospectos")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[crm] updateProspecto:", error.message);
    return null;
  }

  const prospecto = await getProspecto(id);
  return prospecto;
}

/** Cambia la etapa del prospecto. */
export async function moveProspecto(
  id: string,
  etapa: EtapaFunnel
): Promise<void> {
  await updateProspecto(id, { etapa });
}

// ─── Notas ─────────────────────────────────────────────────────────────────────

/** Agrega una nota al prospecto. */
export async function addNota(
  prospectoId: string,
  texto: string
): Promise<Nota | null> {
  const usuario = await getCurrentUser();
  if (!usuario?.empresa_id) throw new Error("Usuario no autenticado o sin empresa");

  const insert = {
    empresa_id: usuario.empresa_id,
    prospecto_id: prospectoId,
    texto: texto.trim(),
  };

  const { data, error } = await supabase
    .from("crm_notas")
    .insert([insert])
    .select()
    .single();

  if (error) {
    console.error("[crm] addNota:", error.message);
    return null;
  }

  return rowToNota(data as NotaRow);
}

/** Elimina un prospecto (y sus notas por CASCADE). */
export async function deleteProspecto(id: string): Promise<void> {
  const { error } = await supabase.from("crm_prospectos").delete().eq("id", id);
  if (error) console.error("[crm] deleteProspecto:", error.message);
}
