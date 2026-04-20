import type { SupabaseAdmin } from "@/lib/chat/types";
import { normalizeWaPhone } from "@/lib/chat/wa-phone";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { isLikelyUnexposedTenantChatSchema } from "@/lib/supabase/chat-data-schema";
import { sendMessageViaYCloud, ycloudSenderToE164 } from "@/lib/chat/ycloud-send-service";
import { sendWhatsAppText, type SendWhatsAppTextResult } from "@/lib/chat/whatsapp-send-service";

/** Contexto mínimo para enviar un mensaje de texto (Meta o YCloud). */
export type ChannelOutboundTextContext =
  | { provider: "meta"; toDigits: string; phoneNumberId: string; accessToken: string }
  | { provider: "ycloud"; toDigits: string; apiKey: string; fromE164: string };

function readYcloudConfig(config: unknown): { apiKey: string; fromE164: string | null } {
  const cfg = config && typeof config === "object" ? (config as Record<string, unknown>) : {};
  const apiKey = typeof cfg.ycloud_api_key === "string" ? cfg.ycloud_api_key.trim() : "";
  const fromRaw = typeof cfg.ycloud_sender_id === "string" ? cfg.ycloud_sender_id.trim() : "";
  const fromE164 = fromRaw ? ycloudSenderToE164(fromRaw) : null;
  return { apiKey, fromE164 };
}

/**
 * Resuelve credenciales y destino para envío de texto según `chat_channels.provider`.
 */
export async function resolveOutboundTextContextFromConversationId(
  supabase: SupabaseAdmin,
  conversationId: string,
  empresaId?: string
): Promise<ChannelOutboundTextContext> {
  const cid = conversationId.trim();
  const ds = empresaId ? await fetchDataSchemaForEmpresaId(empresaId) : undefined;
  const pool = getChatPostgresPool();
  const sch = ds?.trim();

  if (pool && sch && isLikelyUnexposedTenantChatSchema(sch)) {
    const r = await pool.query(
      `SELECT contact_id::text AS contact_id, channel_id::text AS channel_id
       FROM ${quoteSchemaTable(sch, "chat_conversations")}
       WHERE id = $1::uuid
       LIMIT 1`,
      [cid]
    );
    const row = r.rows?.[0] as { contact_id?: string; channel_id?: string } | undefined;
    if (row?.contact_id && row?.channel_id) {
      return resolveOutboundTextContextFromIds(
        supabase,
        { contactId: row.contact_id, channelId: row.channel_id },
        { dataSchema: sch }
      );
    }
    throw new Error("Conversación no encontrada");
  }

  const { data: conv, error: convErr } = await supabase
    .from("chat_conversations")
    .select("contact_id, channel_id")
    .eq("id", cid)
    .maybeSingle();
  if (convErr || !conv) throw new Error(convErr?.message ?? "Conversación no encontrada");
  return resolveOutboundTextContextFromIds(
    supabase,
    {
      contactId: (conv as { contact_id: string }).contact_id,
      channelId: (conv as { channel_id: string }).channel_id,
    },
    empresaId ? { dataSchema: ds } : undefined
  );
}

type ContactRowMin = { phone_number?: string | null };
type ChannelRowMin = {
  meta_phone_number_id?: string | null;
  whatsapp_access_token?: string | null;
  activo?: boolean;
  provider?: string | null;
  config?: unknown;
};

function buildOutboundTextContextFromRows(
  contact: ContactRowMin | null | undefined,
  channel: ChannelRowMin | null | undefined
): ChannelOutboundTextContext {
  if (channel && channel.activo === false) {
    throw new Error("El canal WhatsApp está desactivado. Activalo en Configuración.");
  }

  const toDigits = normalizeWaPhone((contact?.phone_number as string) ?? "");
  const providerRaw = channel?.provider;
  const provider = String(providerRaw ?? "meta").toLowerCase().trim();

  if (provider === "ycloud") {
    if (!toDigits) {
      throw new Error("Falta teléfono del contacto para enviar por YCloud");
    }
    const { apiKey, fromE164 } = readYcloudConfig(channel?.config);
    if (!apiKey) {
      throw new Error("Falta ycloud_api_key en la configuración del canal YCloud");
    }
    if (!fromE164) {
      throw new Error(
        "Falta ycloud_sender_id válido en el canal (número en formato internacional, ej. +5491123456789)"
      );
    }
    return { provider: "ycloud", toDigits, apiKey, fromE164 };
  }

  const phoneNumberId =
    channel?.meta_phone_number_id ?? process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const tokenInChannel =
    typeof channel?.whatsapp_access_token === "string" ? channel.whatsapp_access_token.trim() : "";
  const accessToken = tokenInChannel || process.env.WHATSAPP_TOKEN?.trim() || "";

  if (!toDigits || !phoneNumberId) {
    throw new Error("Falta teléfono del contacto o phone_number_id del canal");
  }
  if (!accessToken) {
    throw new Error(
      "Falta token de Meta para enviar: configurá WHATSAPP_TOKEN en Vercel o el token del canal en Conversaciones → Configuración."
    );
  }

  return { provider: "meta", toDigits, phoneNumberId, accessToken };
}

export async function resolveOutboundTextContextFromIds(
  supabase: SupabaseAdmin,
  input: { contactId: string; channelId: string },
  opts?: { dataSchema?: string }
): Promise<ChannelOutboundTextContext> {
  const pool = getChatPostgresPool();
  const sch = opts?.dataSchema?.trim();
  const usePg = Boolean(pool && sch && isLikelyUnexposedTenantChatSchema(sch));

  if (usePg && pool && sch) {
    const [cRes, chRes] = await Promise.all([
      pool.query(
        `SELECT phone_number FROM ${quoteSchemaTable(sch, "chat_contacts")} WHERE id = $1::uuid LIMIT 1`,
        [input.contactId]
      ),
      pool.query(
        `SELECT meta_phone_number_id, whatsapp_access_token, activo, provider, config
         FROM ${quoteSchemaTable(sch, "chat_channels")} WHERE id = $1::uuid LIMIT 1`,
        [input.channelId]
      ),
    ]);
    const contact = cRes.rows?.[0] as ContactRowMin | undefined;
    const channel = chRes.rows?.[0] as ChannelRowMin | undefined;
    if (contact && channel) {
      return buildOutboundTextContextFromRows(contact, channel);
    }
  }

  const [{ data: contact, error: cErr }, { data: channel, error: chErr }] = await Promise.all([
    supabase.from("chat_contacts").select("phone_number").eq("id", input.contactId).maybeSingle(),
    supabase
      .from("chat_channels")
      .select("meta_phone_number_id, whatsapp_access_token, activo, provider, config")
      .eq("id", input.channelId)
      .maybeSingle(),
  ]);
  if (cErr) throw new Error(cErr.message);
  if (chErr) throw new Error(chErr.message);

  return buildOutboundTextContextFromRows(
    contact as ContactRowMin | null,
    channel as ChannelRowMin | null
  );
}

export async function sendOutboundTextMessage(
  ctx: ChannelOutboundTextContext,
  text: string
): Promise<SendWhatsAppTextResult> {
  if (ctx.provider === "ycloud") {
    return sendMessageViaYCloud({
      apiKey: ctx.apiKey,
      fromE164: ctx.fromE164,
      toDigits: ctx.toDigits,
      text,
    });
  }
  return sendWhatsAppText({
    toDigits: ctx.toDigits,
    phoneNumberId: ctx.phoneNumberId,
    accessToken: ctx.accessToken,
    text,
  });
}

export function ycloudOutboundUnsupportedMessage(feature: string): string {
  return `En canales YCloud aún no está soportado: ${feature}. Usá mensaje de texto o un canal Meta.`;
}

export function ycloudOutboundUnsupported(feature: string): SendWhatsAppTextResult {
  return {
    ok: false,
    error: ycloudOutboundUnsupportedMessage(feature),
  };
}
