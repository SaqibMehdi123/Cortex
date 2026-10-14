// Apply Agent — chat thread helpers. Agent conversations are plain
// ChatMessage rows with thread 'agent' (single v1 thread — cards are
// self-contained, so per-draft threads are unnecessary; the thread column
// format 'agent:draft:<id>' remains reserved for later).

import { db } from '@/lib/db'
import type { AgentCard } from '@/lib/agent/types'

export const AGENT_THREAD = 'agent'

/** Persist one assistant message in the agent thread, optionally carrying a structured card. */
export async function writeAgentMessage(userId: string, content: string, card?: AgentCard) {
  return db.chatMessage.create({
    data: {
      userId,
      thread: AGENT_THREAD,
      role: 'assistant',
      content,
      ...(card ? { payload: JSON.parse(JSON.stringify(card)) } : {}),
    },
  })
}

/** Persist a user message in the agent thread (uploads / chip replies). */
export async function writeAgentUserMessage(
  userId: string,
  content: string,
  attachment?: { ref: string; name: string }
) {
  return db.chatMessage.create({
    data: {
      userId,
      thread: AGENT_THREAD,
      role: 'user',
      content,
      ...(attachment ? { attachmentRef: attachment.ref, attachmentName: attachment.name, attachmentKind: 'resume' } : {}),
    },
  })
}

/** Recent agent-thread history for LLM context (oldest last). */
export async function agentHistory(userId: string, take = 20) {
  const rows = await db.chatMessage.findMany({
    where: { userId, thread: AGENT_THREAD },
    orderBy: { createdAt: 'desc' },
    take,
  })
  return rows.reverse()
}
