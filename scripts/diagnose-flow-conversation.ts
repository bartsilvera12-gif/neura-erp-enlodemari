/**
 * Diagnóstico puntual: conversación + opción + FK (Postgres).
 *
 * .env.local: SUPABASE_DB_URL | DIRECT_URL | DATABASE_URL
 * CHAT_DIAGNOSE_EMPRESA_ID, CHAT_DIAGNOSE_SCHEMA
 *
 * Opcional: CHAT_DIAGNOSE_CONVERSATION_ID, CHAT_DIAGNOSE_OPTION_ID
 *
 * npx tsx scripts/diagnose-flow-conversation.ts
 */
import { config } from "dotenv";
import path from "node:path";
import pg from "pg";

config({ path: path.resolve(process.cwd(), ".env.local") });

const url =
  process.env.SUPABASE_DB_URL?.trim() ||
  process.env.DIRECT_URL?.trim() ||
  process.env.DATABASE_URL?.trim();
const empresaId = process.env.CHAT_DIAGNOSE_EMPRESA_ID?.trim();
const schema = process.env.CHAT_DIAGNOSE_SCHEMA?.trim();
const conversationId =
  process.env.CHAT_DIAGNOSE_CONVERSATION_ID?.trim() ||
  "5abb9f49-e708-4e43-ba42-694f39d216e4";
const optionId =
  process.env.CHAT_DIAGNOSE_OPTION_ID?.trim() || "aba5bca2-082e-40e1-b30a-ccbc9bc7873e";

async function main() {
  if (!url) {
    console.error("Falta SUPABASE_DB_URL, DIRECT_URL o DATABASE_URL");
    process.exit(1);
  }
  if (!empresaId || !schema) {
    console.error("Faltan CHAT_DIAGNOSE_EMPRESA_ID o CHAT_DIAGNOSE_SCHEMA");
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: url,
    ssl: url.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  try {
    const conv = await client.query(
      `
      SELECT id::text, empresa_id::text, channel_id::text, status::text, human_taken_over,
             flow_status::text, flow_code::text, active_flow_session_id::text, updated_at
      FROM ${schema}.chat_conversations
      WHERE id = $1::uuid AND empresa_id = $2::uuid
      `,
      [conversationId, empresaId]
    );
    console.log("[conv]", conv.rows[0] ?? null);

    const sessions = await client.query(
      `
      SELECT id::text, conversation_id::text, flow_code::text, status::text,
             created_at, updated_at
      FROM ${schema}.chat_flow_sessions
      WHERE conversation_id = $1::uuid AND empresa_id = $2::uuid
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 5
      `,
      [conversationId, empresaId]
    );
    console.log("[sessions]", sessions.rows);

    const optTenant = await client.query(
      `SELECT id::text, node_id::text, label::text, meta_button_id::text, option_value::text
       FROM ${schema}.chat_flow_options WHERE id = $1::uuid`,
      [optionId]
    );
    console.log("[chat_flow_options tenant]", optTenant.rows);

    try {
      const optZ = await client.query(
        `SELECT id::text, node_id::text FROM zentra_erp.chat_flow_options WHERE id = $1::uuid`,
        [optionId]
      );
      console.log("[chat_flow_options zentra_erp]", optZ.rows);
    } catch (e) {
      console.log("[chat_flow_options zentra_erp] (skip)", e instanceof Error ? e.message : e);
    }

    const ev = await client.query(
      `
      SELECT id::text, event_type::text, selected_option_id::text, node_code::text, created_at
      FROM ${schema}.chat_flow_events
      WHERE conversation_id = $1::uuid AND empresa_id = $2::uuid
      ORDER BY created_at DESC NULLS LAST
      LIMIT 8
      `,
      [conversationId, empresaId]
    );
    console.log("[recent events]", ev.rows);

    const fk = await client.query(
      `
      SELECT c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = $1 AND t.relname = 'chat_flow_events' AND c.contype = 'f'
        AND pg_get_constraintdef(c.oid) LIKE '%chat_flow_options%'
      `,
      [schema]
    );
    console.log("[fk chat_flow_events → chat_flow_options]", fk.rows);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
