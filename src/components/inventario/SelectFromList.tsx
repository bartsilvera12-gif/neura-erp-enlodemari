"use client";

/** Selector tipo dropdown sencillo con opcion "Sin asignar". */

interface Option { id: string; label: string; sublabel?: string }

interface Props {
  value: string | null;
  onChange: (v: string | null) => void;
  options: Option[];
  placeholder?: string;
  emptyText?: string;
  className?: string;
}

export default function SelectFromList({
  value,
  onChange,
  options,
  placeholder = "Sin asignar",
  emptyText = "No hay opciones disponibles.",
  className = "",
}: Props) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={
        "w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#0EA5E9] bg-white text-sm " +
        className
      }
    >
      <option value="">{options.length === 0 ? emptyText : placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}{o.sublabel ? ` — ${o.sublabel}` : ""}
        </option>
      ))}
    </select>
  );
}
