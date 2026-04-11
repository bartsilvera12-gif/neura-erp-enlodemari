"use client";

import { useId, useState } from "react";

type ConfigCollapsibleSectionProps = {
  title: string;
  description?: string;
  /** Si true, la sección inicia expandida (estado local, no persiste). */
  defaultExpanded?: boolean;
  children: React.ReactNode;
};

/**
 * Sección de configuración con cabecera fija y expansión controlada por switch (estilo SaaS).
 * El switch ON usa verde alineado al badge "Activo" del ERP (emerald).
 */
export function ConfigCollapsibleSection({
  title,
  description,
  defaultExpanded = false,
  children,
}: ConfigCollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const headingId = useId();
  const panelId = useId();

  return (
    <div
      className={`rounded-xl border shadow-sm overflow-hidden transition-[border-color,box-shadow,background-color] duration-300 ease-out ${
        expanded
          ? "border-emerald-200/90 bg-white shadow-md ring-1 ring-emerald-100/50"
          : "border-slate-200 bg-slate-50/70 shadow-sm"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 px-4 py-4 sm:px-5 sm:py-4">
        <div className="min-w-0 flex-1" id={headingId}>
          <h3
            className={`text-sm font-semibold tracking-tight transition-colors duration-200 ${
              expanded ? "text-slate-900" : "text-slate-600"
            }`}
          >
            {title}
          </h3>
          {description ? (
            <p className="mt-1 text-xs text-slate-500 leading-relaxed max-w-4xl">{description}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5 sm:pt-0.5">
          <label className="inline-flex cursor-pointer items-center gap-2 select-none">
            <span className="sr-only">{expanded ? "Contraer sección" : "Expandir sección"}</span>
            <input
              type="checkbox"
              role="switch"
              aria-checked={expanded}
              aria-controls={panelId}
              checked={expanded}
              onChange={(e) => setExpanded(e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className="relative h-6 w-11 shrink-0 rounded-full bg-slate-300 transition-colors duration-300 ease-out peer-checked:bg-emerald-500 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky-400 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-300 after:ease-out peer-checked:after:translate-x-5"
            />
          </label>
          <span
            className={`text-[10px] font-bold uppercase tracking-wide transition-colors duration-200 ${
              expanded ? "text-emerald-700" : "text-slate-400"
            }`}
          >
            {expanded ? "Visible" : "Oculto"}
          </span>
        </div>
      </div>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div id={panelId} role="region" aria-labelledby={headingId} className="min-h-0 overflow-hidden">
          <div className="border-t border-slate-100/90 bg-gradient-to-b from-slate-50/40 to-white px-4 py-5 sm:px-5 sm:py-6">
            <div className="w-full">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
