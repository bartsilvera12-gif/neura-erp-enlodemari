import type { Pool } from "pg";
import { quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";

export async function pgLoadConversationForSend(
  pool: Pool,
  schema: string,
  conversationId: string
): Promise<{ empresa_id: string; contact_id: string; channel_id: string } | null> {
  const q = `
    SELECT empresa_id::text AS empresa_id, contact_id::text AS contact_id, channel_id::text AS channel_id
    FROM ${quoteSchemaTable(schema, "chat_conversations")}
    WHERE id = $1::uuid
    LIMIT 1
  `;
  const r = await pool.query(q, [conversationId.trim()]);
  const row = r.rows?.[0] as
    | { empresa_id?: string; contact_id?: string; channel_id?: string }
    | undefined;
  if (!row?.empresa_id || !row.contact_id || !row.channel_id) return null;
  return {
    empresa_id: row.empresa_id,
    contact_id: row.contact_id,
    channel_id: row.channel_id,
  };
}

export async function pgInsertChatMessageOutbound(
  pool: Pool,
  schema: string,
  row: {
    empresa_id: string;
    conversation_id: string;
    wa_message_id: string | null;
    from_me: boolean;
    sender_type: string;
    sent_by_user_id: string | null;
    sent_by_user_name: string | null;
    automation_source: string | null;
    message_type: string;
    content: string;
    raw_payload: Record<string, unknown>;
  }
): Promise<void> {
  const qt = quoteSchemaTable(schema, "chat_messages");
  const raw = JSON.stringify(row.raw_payload ?? {});
  const q = `
    INSERT INTO ${qt} (
      empresa_id, conversation_id, wa_message_id, from_me,
      sender_type, sent_by_user_id, sent_by_user_name, automation_source,
      message_type, content, raw_payload
    )
    VALUES (
      $1::uuid, $2::uuid, $3, $4,
      $5, $6::uuid, $7, $8,
      $9, $10, $11::jsonb
    )
  `;
  await pool.query(q, [
    row.empresa_id,
    row.conversation_id,
    row.wa_message_id,
    row.from_me,
    row.sender_type,
    row.sent_by_user_id,
    row.sent_by_user_name,
    row.automation_source,
    row.message_type,
    row.content,
    raw,
  ]);
}

export async function pgTouchConversationLastMessage(
  pool: Pool,
  schema: string,
  conversationId: string,
  ts: string,
  preview: string
): Promise<void> {
  const qt = quoteSchemaTable(schema, "chat_conversations");
  const q = `
    UPDATE ${qt}
    SET last_message_at = $2::timestamptz,
        last_message_preview = $3,
        updated_at = $2::timestamptz
    WHERE id = $1::uuid
  `;
  await pool.query(q, [conversationId.trim(), ts, preview.slice(0, 280)]);
}

export async function pgMarkFirstHumanReplyIfUnset(
  pool: Pool,
  schema: string,
  empresaId: string,
  conversationId: string,
  ts: string
): Promise<void> {
  const qt = quoteSchemaTable(schema, "chat_conversations");
  const q = `
    UPDATE ${qt}
    SET first_human_response_at = $3::timestamptz,
        updated_at = $3::timestamptz
    WHERE id = $2::uuid
      AND empresa_id = $1::uuid
      AND first_human_response_at IS NULL
  `;
  await pool.query(q, [empresaId, conversationId.trim(), ts]);
}
