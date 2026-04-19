import { isAgentSessionOnline } from "@/lib/chat/agent-presence";
import type { SupabaseAdmin } from "@/lib/chat/types";

export type EligibleAgentRow = {
  id: string;
  max_conversations: number;
  priority_in_queue: number;
};

/**
 * Chats activos para carga: conversaciones no cerradas (open + pending).
 * Criterio explícito alineado con Menor carga y monitoreo.
 */
export const ACTIVE_CONVERSATION_STATUSES = ["open", "pending"] as const;

export async function loadEligibleAgentsForQueue(
  supabase: SupabaseAdmin,
  empresaId: string,
  queueId: string
): Promise<EligibleAgentRow[]> {
  const { data, error } = await supabase
    .from("chat_agents")
    .select("id, max_conversations, priority_in_queue, last_heartbeat_at")
    .eq("empresa_id", empresaId)
    .eq("queue_id", queueId)
    .eq("is_active", true)
    .eq("receives_new_chats", true)
    .eq("operational_status", "ready");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as (EligibleAgentRow & { last_heartbeat_at?: string | null })[];
  return rows
    .filter((r) => isAgentSessionOnline(r.last_heartbeat_at ?? null))
    .map(({ id, max_conversations, priority_in_queue }) => ({ id, max_conversations, priority_in_queue }));
}

export async function countActiveConversationsByAgent(
  supabase: SupabaseAdmin,
  empresaId: string,
  agentIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (agentIds.length === 0) return map;
  const { data, error } = await supabase
    .from("chat_conversations")
    .select("assigned_agent_id")
    .eq("empresa_id", empresaId)
    .in("assigned_agent_id", agentIds)
    .in("status", [...ACTIVE_CONVERSATION_STATUSES]);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const aid = row.assigned_agent_id as string | null;
    if (!aid) continue;
    map.set(aid, (map.get(aid) ?? 0) + 1);
  }
  return map;
}

export function filterAgentsUnderCap(
  agents: EligibleAgentRow[],
  loadById: Map<string, number>
): EligibleAgentRow[] {
  return agents.filter((a) => {
    const load = loadById.get(a.id) ?? 0;
    const cap = Math.max(1, a.max_conversations ?? 5);
    return load < cap;
  });
}
