/**
 * In-memory turn log keyed by Instagram user id.
 * Persists for the process lifetime; buyer card holds durable facts.
 */
export class ConversationMemory {
  constructor() {
    this.turns = new Map();
  }

  getTurns(instagramUserId) {
    return this.turns.get(String(instagramUserId)) || [];
  }

  addTurn(instagramUserId, turn) {
    const id = String(instagramUserId);
    const list = this.getTurns(id);
    list.push({
      ...turn,
      at: turn.at || new Date().toISOString()
    });
    // Keep recent context only
    this.turns.set(id, list.slice(-40));
    return this.getTurns(id);
  }

  clear(instagramUserId) {
    this.turns.delete(String(instagramUserId));
  }

  recentContext(instagramUserId, limit = 8) {
    return this.getTurns(instagramUserId).slice(-limit);
  }

  buildSummary(instagramUserId, buyer) {
    const turns = this.getTurns(instagramUserId);
    const lastUser = [...turns].reverse().find((t) => t.role === "user");
    const parts = [];
    if (buyer?.conversationSummary) parts.push(buyer.conversationSummary);
    if (lastUser?.text) parts.push(`Last buyer message: ${lastUser.text}`);
    return parts.join(" | ").slice(0, 500) || null;
  }
}
