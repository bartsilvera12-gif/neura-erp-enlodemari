"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { WhatsAppChannelForm } from "@/components/chat/WhatsAppChannelForm";

function hasOmnichannelFromModuleAccess(body: {
  superAdmin?: boolean;
  slugs?: string[];
}): boolean {
  if (body.superAdmin) return true;
  const slugs = Array.isArray(body.slugs) ? body.slugs : [];
  return slugs.includes("conversaciones") || slugs.includes("omnicanal");
}

export default function NuevoCanalWhatsappPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    fetchWithSupabaseSession("/api/empresas/module-access", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          setAllowed(false);
          return;
        }
        const body = (await res.json()) as { superAdmin?: boolean; slugs?: string[] };
        setAllowed(hasOmnichannelFromModuleAccess(body));
      })
      .catch(() => setAllowed(false));
  }, []);

  if (allowed === null) {
    return <div className="py-24 text-center text-sm text-slate-400">Cargando…</div>;
  }

  if (!allowed) {
    return (
      <div className="max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Módulo no habilitado.{" "}
        <Link href="/configuracion/canales" className="font-semibold underline">
          Volver
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-none space-y-6 px-4 sm:px-6 lg:px-8 xl:px-10 pb-10">
      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/configuracion" className="hover:text-slate-800">
          Configuración
        </Link>
        <span>/</span>
        <Link href="/configuracion/canales" className="hover:text-slate-800">
          Canales
        </Link>
        <span>/</span>
        <span className="text-slate-800 font-medium">Conectar WhatsApp</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Conectar WhatsApp (Meta)</h1>
        <p className="text-sm text-slate-500 mt-1">
          Usá el <strong>Phone number ID</strong> que envía Meta en{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">metadata.phone_number_id</code> del webhook.
        </p>
      </div>

      <section className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:p-8">
        <WhatsAppChannelForm
          mode="create"
          cancelHref="/configuracion/canales"
          submitLabelCreate="Conectar y guardar"
          onSaved={(id) => router.push(`/configuracion/canales/${id}`)}
        />
      </section>

      <details className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-900">
        <summary className="font-medium cursor-pointer">Demo / variables de entorno</summary>
        <p className="mt-2 pl-1 text-sky-800/90">
          Opcional: <code className="text-xs">WHATSAPP_DEFAULT_EMPRESA_ID</code> y{" "}
          <code className="text-xs">WHATSAPP_PHONE_NUMBER_ID</code> en el servidor para aprovisionar el primer canal.
        </p>
      </details>
    </div>
  );
}
