"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Users, Calendar, Handshake, DollarSign, Trophy, TrendingUp } from "lucide-react";
import { getProspectos, moveProspecto } from "@/lib/crm/storage";
import type { EtapaFunnel, Prospecto } from "@/lib/crm/types";

// ── Configuración de etapas ────────────────────────────────────────────────────

const ETAPAS: EtapaFunnel[] = [
  "LEAD", "CONTACTADO", "NEGOCIACION", "GANADO", "PERDIDO",
];

const ETAPA_CFG: Record<EtapaFunnel, {
  label:      string;
  headerBg:   string;
  headerText: string;
  border:     string;
  dot:        string;
}> = {
  LEAD:        { label: "Lead",        headerBg: "bg-gray-100",  headerText: "text-gray-700",  border: "border-gray-200",  dot: "bg-gray-400"  },
  CONTACTADO:  { label: "Contactado",  headerBg: "bg-blue-50",   headerText: "text-blue-700",  border: "border-blue-200",  dot: "bg-blue-500"  },
  NEGOCIACION: { label: "Negociación", headerBg: "bg-amber-50",  headerText: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
  GANADO:      { label: "Ganado",      headerBg: "bg-green-50",  headerText: "text-green-700", border: "border-green-200", dot: "bg-green-500" },
  PERDIDO:     { label: "Perdido",     headerBg: "bg-red-50",    headerText: "text-red-700",   border: "border-red-200",   dot: "bg-red-400"   },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatGs(valor: number) {
  if (valor >= 1_000_000) return `${(valor / 1_000_000).toFixed(1)}M`;
  if (valor >= 1_000)     return `${(valor / 1_000).toFixed(0)}k`;
  return valor.toLocaleString("es-PY");
}

function formatFecha(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  } catch { return ""; }
}

function formatFechaCorta(yyyymmdd: string) {
  if (!yyyymmdd) return "";
  const [, m, d] = yyyymmdd.split("-");
  return `${d}/${m}`;
}

/** Verifica si una fecha ISO cae en el día de hoy. */
function esHoy(isoStr: string): boolean {
  const d = new Date(isoStr);
  const hoy = new Date();
  return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth() && d.getDate() === hoy.getDate();
}

/** Verifica si una fecha ISO cae en el mes actual. */
function esMesActual(isoStr: string): boolean {
  const d = new Date(isoStr);
  const hoy = new Date();
  return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth();
}

// ── Avatar ────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-amber-500",
  "bg-green-600", "bg-pink-500", "bg-cyan-600",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "xs" }) {
  const sizeClass = size === "xs" ? "w-5 h-5 text-[9px]" : "w-6 h-6 text-[10px]";
  return (
    <span className={`inline-flex items-center justify-center rounded-full ${sizeClass} ${getAvatarColor(name)} text-white font-bold shrink-0`}>
      {getInitials(name)}
    </span>
  );
}

// ── ProspectoCard ─────────────────────────────────────────────────────────────

function ProspectoCard({
  prospecto,
  onDragStart,
  onMoverEtapa,
}: {
  prospecto:    Prospecto;
  onDragStart:  (id: string) => void;
  onMoverEtapa: (id: string, etapa: EtapaFunnel) => void;
}) {
  const esGanado  = prospecto.etapa === "GANADO";
  const esPerdido = prospecto.etapa === "PERDIDO";

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(prospecto.id));
        e.dataTransfer.effectAllowed = "move";
        onDragStart(prospecto.id);
      }}
      className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-all select-none group"
    >
      {/* Empresa + control */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0">
          <p className="font-semibold text-gray-800 text-sm leading-tight truncate">
            {prospecto.empresa}
          </p>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{prospecto.numero_control}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {prospecto.notas.length > 0 && (
            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
              {prospecto.notas.length}💬
            </span>
          )}
          <Link
            href={`/crm/${prospecto.id}`}
            onClick={(e) => e.stopPropagation()}
            className="p-1 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
            title="Editar prospecto"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.5a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Servicio */}
      <p className="text-xs text-gray-500 line-clamp-2 mb-2">{prospecto.servicio}</p>

      {/* Valor estimado */}
      <p className="text-sm font-bold text-gray-900 tabular-nums mb-2">
        Gs. {prospecto.valor_estimado.toLocaleString("es-PY")}
      </p>

      {/* Contacto */}
      <div className="text-xs text-gray-600 mb-2 truncate">
        👤 {prospecto.contacto}
      </div>

      {/* Próxima acción */}
      {prospecto.proxima_accion && (
        <div className="flex items-start gap-1 bg-amber-50 border border-amber-100 rounded px-2 py-1.5 mb-2">
          <span className="text-amber-500 shrink-0 mt-0.5">⏰</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-amber-800 font-medium leading-tight truncate">
              {prospecto.proxima_accion}
            </p>
            {prospecto.fecha_proxima_accion && (
              <p className="text-xs text-amber-500 font-semibold mt-0.5">
                {formatFechaCorta(prospecto.fecha_proxima_accion)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Responsable + fecha creación */}
      <div className="flex items-center justify-between border-t border-gray-100 pt-2 mt-1">
        {prospecto.responsable ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <Avatar name={prospecto.responsable} size="xs" />
            <span className="text-xs text-gray-500 truncate">{prospecto.responsable}</span>
          </div>
        ) : (
          <span className="text-xs text-gray-300 italic">Sin responsable</span>
        )}
        <span className="text-xs text-gray-400 shrink-0 ml-2">
          {formatFecha(prospecto.fecha_creacion)}
        </span>
      </div>

      {/* Acciones rápidas (solo en etapas activas) */}
      {!esGanado && !esPerdido && (
        <div className="mt-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMoverEtapa(prospecto.id, "GANADO"); }}
            className="flex-1 text-xs text-green-600 hover:text-green-800 hover:bg-green-50 border border-green-200 rounded px-2 py-1 transition-colors font-medium"
          >
            ✓ Ganado
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMoverEtapa(prospecto.id, "PERDIDO"); }}
            className="flex-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded px-2 py-1 transition-colors font-medium"
          >
            ✗ Perdido
          </button>
        </div>
      )}

      {/* Badge GANADO — preparar cliente */}
      {esGanado && (
        <div className="mt-2 bg-green-50 border border-green-200 rounded px-2 py-1.5 flex items-center justify-between gap-2">
          <span className="text-xs text-green-700 font-medium">
            {prospecto.cliente_creado ? "✓ Cliente creado" : "✓ Ganado"}
          </span>
          {!prospecto.cliente_creado && (
            <Link
              href={`/clientes/nuevo?from_crm=${prospecto.id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-green-600 hover:text-green-900 font-semibold underline shrink-0"
            >
              Crear cliente →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ── Columna Kanban ────────────────────────────────────────────────────────────

function Columna({
  etapa,
  prospectos,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  onMoverEtapa,
}: {
  etapa:        EtapaFunnel;
  prospectos:   Prospecto[];
  isDragOver:   boolean;
  onDragOver:   (e: React.DragEvent) => void;
  onDragLeave:  () => void;
  onDrop:       (e: React.DragEvent) => void;
  onDragStart:  (id: string) => void;
  onMoverEtapa: (id: string, etapa: EtapaFunnel) => void;
}) {
  const cfg   = ETAPA_CFG[etapa];
  const total = prospectos.reduce((s, p) => s + p.valor_estimado, 0);

  return (
    <div
      className={`flex flex-col w-72 min-w-72 rounded-xl border-2 transition-colors duration-150 ${
        isDragOver
          ? "border-gray-400 bg-gray-100/60"
          : `${cfg.border} bg-gray-50/30`
      }`}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) onDragLeave();
      }}
      onDrop={onDrop}
    >
      {/* Header de columna */}
      <div className={`${cfg.headerBg} rounded-t-xl px-4 py-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
            <span className={`font-semibold text-sm ${cfg.headerText}`}>{cfg.label}</span>
            <span className="text-xs bg-white/70 text-gray-600 px-1.5 py-0.5 rounded-full font-semibold">
              {prospectos.length}
            </span>
          </div>
          {total > 0 && (
            <span className="text-xs text-gray-500 tabular-nums font-semibold">
              Gs. {formatGs(total)}
            </span>
          )}
        </div>
      </div>

      {/* Lista de cards */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-24 max-h-[calc(100vh-320px)]">
        {prospectos.length === 0 ? (
          <div className={`flex items-center justify-center h-20 rounded-lg border-2 border-dashed text-xs text-gray-300 transition-colors ${
            isDragOver ? "border-gray-400 text-gray-500" : "border-gray-200"
          }`}>
            Arrastrá aquí
          </div>
        ) : (
          prospectos.map((p) => (
            <ProspectoCard
              key={p.id}
              prospecto={p}
              onDragStart={onDragStart}
              onMoverEtapa={onMoverEtapa}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Tarjeta de métrica ────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className={`bg-white rounded-xl border ${color} p-4 shadow-sm`}>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="w-4 h-4 text-slate-500" />}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-800 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function CrmPage() {
  const [prospectos,    setProspectos]    = useState<Prospecto[]>([]);
  const [dragOverEtapa, setDragOverEtapa] = useState<EtapaFunnel | null>(null);
  const dragIdRef = useRef<string | null>(null);

  function recargar() {
    getProspectos().then(setProspectos);
  }

  useEffect(() => { recargar(); }, []);

  function handleDragStart(id: string) {
    dragIdRef.current = id;
  }

  async function handleDrop(e: React.DragEvent, etapa: EtapaFunnel) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id) {
      await moveProspecto(id, etapa);
      recargar();
    }
    setDragOverEtapa(null);
    dragIdRef.current = null;
  }

  async function handleMoverEtapa(id: string, etapa: EtapaFunnel) {
    await moveProspecto(id, etapa);
    recargar();
  }

  const porEtapa = (etapa: EtapaFunnel) => prospectos.filter((p) => p.etapa === etapa);

  // ── Métricas del mini dashboard ───────────────────────────────────────────

  const leadsHoy = prospectos.filter((p) => esHoy(p.fecha_creacion)).length;
  const leadsMes = prospectos.filter((p) => esMesActual(p.fecha_creacion)).length;

  const enNegociacion    = porEtapa("NEGOCIACION");
  const cantNegociacion  = enNegociacion.length;
  const valorNegociacion = enNegociacion.reduce((s, p) => s + p.valor_estimado, 0);

  const ganadosHoy = prospectos.filter((p) => p.etapa === "GANADO" && esHoy(p.fecha_actualizacion));
  const ingresosGanadosHoy = ganadosHoy.reduce((s, p) => s + p.valor_estimado, 0);

  const ganadosMes = prospectos.filter((p) => p.etapa === "GANADO" && esMesActual(p.fecha_actualizacion));
  const ingresosMes = ganadosMes.reduce((s, p) => s + p.valor_estimado, 0);

  return (
    <div className="flex flex-col gap-5 h-full">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">CRM Funnel</h1>
          <p className="text-gray-500 text-sm mt-1">Pipeline comercial · {prospectos.length} oportunidades totales</p>
        </div>
        <Link
          href="/crm/nuevo"
          className="flex items-center gap-1.5 bg-[#0EA5E9] hover:bg-[#0284C7] text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm shrink-0 active:scale-95"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          Nuevo prospecto
        </Link>
      </div>

      {/* Mini dashboard comercial */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <MetricCard
          label="Leads Hoy"
          value={leadsHoy}
          sub="creados hoy"
          color="border-slate-200"
          icon={Users}
        />
        <MetricCard
          label="Leads del Mes"
          value={leadsMes}
          sub="creados en el mes"
          color="border-slate-200"
          icon={Calendar}
        />
        <MetricCard
          label="En Negociación"
          value={cantNegociacion}
          sub="oportunidades activas"
          color="border-amber-200"
          icon={Handshake}
        />
        <MetricCard
          label="Valor en Negociación"
          value={`Gs. ${formatGs(valorNegociacion)}`}
          sub="pipeline en proceso"
          color="border-amber-200"
          icon={DollarSign}
        />
        <MetricCard
          label="Ganados Hoy"
          value={ganadosHoy.length}
          sub="cierres del día"
          color="border-green-200"
          icon={Trophy}
        />
        <MetricCard
          label="Ingresos Ganados Hoy"
          value={`Gs. ${formatGs(ingresosGanadosHoy)}`}
          sub="valor cerrado hoy"
          color="border-green-200"
          icon={DollarSign}
        />
        <MetricCard
          label="Ganados del Mes"
          value={ganadosMes.length}
          sub="cierres del mes"
          color="border-green-200"
          icon={Trophy}
        />
        <MetricCard
          label="Ingresos del Mes"
          value={`Gs. ${formatGs(ingresosMes)}`}
          sub="valor cerrado en el mes"
          color="border-green-200"
          icon={TrendingUp}
        />
      </div>

      {/* Tablero Kanban (scroll horizontal) */}
      <div className="overflow-x-auto pb-4 -mx-2 px-2">
        <div className="flex gap-4 min-w-max items-start">
          {ETAPAS.map((etapa) => (
            <Columna
              key={etapa}
              etapa={etapa}
              prospectos={porEtapa(etapa)}
              isDragOver={dragOverEtapa === etapa}
              onDragOver={(e) => { e.preventDefault(); setDragOverEtapa(etapa); }}
              onDragLeave={() => setDragOverEtapa(null)}
              onDrop={(e) => handleDrop(e, etapa)}
              onDragStart={handleDragStart}
              onMoverEtapa={handleMoverEtapa}
            />
          ))}
        </div>
      </div>

    </div>
  );
}
