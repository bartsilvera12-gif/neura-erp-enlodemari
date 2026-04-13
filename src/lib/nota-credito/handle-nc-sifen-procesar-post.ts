import { NextRequest, NextResponse } from "next/server";
import type { UsuarioConEmpresaYRol } from "@/lib/middleware/auth";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { handleNcSifenXmlPost } from "./handle-nc-sifen-xml-post";
import { handleNcSifenFirmarPost } from "./handle-nc-sifen-firmar-post";
import { handleNcSifenEnviarPost } from "./handle-nc-sifen-enviar-post";

export type HandleNcSifenProcesarPostOptions = {
  soloAmbienteTest: boolean;
};

/**
 * Ejecuta en secuencia: generar XML → firmar → enviar lote (recibe-lote).
 */
export async function handleNcSifenProcesarPost(opts: {
  request: NextRequest;
  auth: UsuarioConEmpresaYRol;
  supabase: AppSupabaseClient;
  notaCreditoId: string;
  options: HandleNcSifenProcesarPostOptions;
}): Promise<NextResponse> {
  const { request, auth, supabase, notaCreditoId, options } = opts;
  const debugXml = request.nextUrl.searchParams.get("debug") === "1";
  const debugSoap = request.nextUrl.searchParams.get("debug_soap") === "1";

  const rXml = await handleNcSifenXmlPost({ auth, supabase, notaCreditoId, debugXml });
  if (!rXml.ok) return rXml;

  const rFir = await handleNcSifenFirmarPost({ auth, supabase, notaCreditoId, debugXml });
  if (!rFir.ok) return rFir;

  return handleNcSifenEnviarPost(supabase, auth, notaCreditoId, options, debugSoap);
}
