import path from "node:path";
import { ConversationMemory } from "../conversation/memory.js";
import { JsonFileStore, runtimeRoot } from "./json-store.js";

/**
 * Conversation memory that mirrors turns to the Railway volume.
 */
export class DurableConversationMemory extends ConversationMemory {
  constructor({ rootDir } = {}) {
    super();
    this.store = new JsonFileStore(path.join(rootDir || runtimeRoot(), "conversation-memory.json"));
    this.ready = this.#hydrate();
  }

  async ensureReady() {
    await this.ready;
  }

  addTurn(instagramUserId, turn) {
    const list = super.addTurn(instagramUserId, turn);
    this.#persist();
    return list;
  }

  clear(instagramUserId) {
    super.clear(instagramUserId);
    this.#persist();
  }

  setPendingOffer(instagramUserId, offer) {
    const result = super.setPendingOffer(instagramUserId, offer);
    this.#persist();
    return result;
  }

  setLastAskedField(instagramUserId, field) {
    const result = super.setLastAskedField(instagramUserId, field);
    this.#persist();
    return result;
  }

  async #hydrate() {
    const data = await this.store.read({ turns: {}, pending: {}, lastAsked: {} });
    this.turns = new Map(Object.entries(data.turns || {}));
    this.pending = new Map(Object.entries(data.pending || {}));
    this.lastAsked = new Map(Object.entries(data.lastAsked || {}));
  }

  #persist() {
    const payload = {
      turns: Object.fromEntries(this.turns),
      pending: Object.fromEntries(this.pending),
      lastAsked: Object.fromEntries(this.lastAsked || [])
    };
    this.store.write(payload).catch(() => {});
  }
}
