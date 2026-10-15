import type { ChatMessage } from './types';

export const GENERAL = 'general';

/** Which conversation a message belongs to, from the current user's point of view. */
export function conversationOf(m: ChatMessage, me: string) {
  if (m.recipient_id === null) return GENERAL;
  return m.sender_id === me ? m.recipient_id : m.sender_id;
}

const seenKey = (me: string, familyId: string) => `family-tree:chat-seen:${me}:${familyId}`;

/** Per-device record of when each conversation was last read. */
export function loadSeen(me: string, familyId: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(seenKey(me, familyId)) ?? '{}');
  } catch {
    return {};
  }
}

export function saveSeen(me: string, familyId: string, seen: Record<string, string>) {
  try {
    localStorage.setItem(seenKey(me, familyId), JSON.stringify(seen));
  } catch {
    // Storage unavailable (private mode); unread counts just won't persist.
  }
}
