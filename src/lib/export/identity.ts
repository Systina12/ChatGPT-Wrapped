import type { ConversationSource } from "../../types/export";

/** Keep source namespaces separate without allocating a composite ID per lookup. */
export function conversationMaps<T, K = string>(): Record<
  ConversationSource,
  Map<K, T>
> {
  return { conversation: new Map(), group_chat: new Map() };
}

/** Length framing remains unambiguous even when either ID contains NUL or ':'. */
export function messageKey(
  conversationId: string,
  messageId: string,
  source: ConversationSource = "conversation",
): string {
  return `${source === "group_chat" ? "g" : "c"}${conversationId.length}:${conversationId}${messageId}`;
}
