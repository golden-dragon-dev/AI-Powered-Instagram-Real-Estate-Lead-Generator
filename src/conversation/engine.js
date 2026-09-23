import { missingDataHandoff, validateMessage } from "../facts/checker.js";
import { extractFactsFromMessage } from "./extract.js";
import { ConversationMemory } from "./memory.js";
import { canPitchBuyer, resolveMatches } from "./match-resolve.js";
import { summarizeBuyer, isCoreQualified } from "./qualify.js";
import { buildConversationReply, fallbackSafeText } from "./replies.js";
import { polishReplyWithModel } from "./llm.js";
import { isAffirmation, resolveAffirmation } from "./affirmation.js";
import { retrieveFacts } from "../facts/retrieval.js";

function hasHighIntent(intents, buyer) {
  if (intents.includes("high_intent")) return true;
  const signals = buyer.intentSignals || [];
  return signals.some((s) =>
    ["high_intent", "reserve_interest", "viewing_request", "callback_request", "agent_request"].includes(s)
  );
}

function leadStatusFor(buyer, intents, matchCount) {
  if (hasHighIntent(intents, buyer)) return "high_intent";
  if (matchCount > 0 && isCoreQualified(buyer)) return "qualified";
  if (canPitchBuyer(buyer)) return "engaged";
  if (buyer.budgetAed || buyer.preferredAreas?.length) return "engaged";
  return buyer.leadStatus || "new";
}

/**
 * Test-environment conversation engine.
 * Matching stays in code. Soft preferences only rank confirmed projects.
 */
export class ConversationEngine {
  constructor({ buyers, properties, memory, llm = null } = {}) {
    if (!buyers || !properties) throw new Error("ConversationEngine requires buyers and properties");
    this.buyers = buyers;
    this.properties = properties;
    this.memory = memory || new ConversationMemory();
    this.llm = llm;
  }

  async handleMessage(instagramUserId, message, options = {}) {
    const text = String(message || "").trim();
    let { facts, signals, intents } = extractFactsFromMessage(text);

    const pendingOffer = this.memory.getPendingOffer(instagramUserId);
    if (isAffirmation(text) && pendingOffer) {
      const resolved = resolveAffirmation(pendingOffer, text);
      if (resolved?.facts) facts = { ...facts, ...resolved.facts };
      if (resolved?.clearPending) this.memory.setPendingOffer(instagramUserId, null);
      if (!intents.includes("affirm")) intents = [...intents, "affirm"];
    }

    // "Show both" from bedroom chips
    if (/^both$/i.test(text) && pendingOffer?.type === "bedroom_choice") {
      this.memory.setPendingOffer(instagramUserId, null);
    }

    let buyer = await this.buyers.remember(instagramUserId, facts);
    if (facts.bedrooms !== undefined || facts.project || facts.area) {
      // Concrete choice made; drop stale pending offer
      if (facts.bedrooms !== undefined || facts.project) {
        this.memory.setPendingOffer(instagramUserId, null);
      }
    }
    this.memory.addTurn(instagramUserId, { role: "user", text, intents, signals });

    const handoffRequested = intents.includes("agent") || Boolean(options.handoffRequested);
    const highIntent = hasHighIntent(intents, buyer);

    const catalog = this.properties.catalog();
    const matchResult = resolveMatches(catalog, buyer);
    const packs = retrieveFacts(matchResult.matches);

    let draft = buildConversationReply({
      buyer,
      message: text,
      intents,
      packs,
      matches: matchResult.matches,
      matchMode: matchResult.mode,
      mismatches: matchResult.mismatches || [],
      highIntent,
      handoffRequested,
      pendingOffer: this.memory.getPendingOffer(instagramUserId)
    });

    if (draft.pendingOffer) {
      this.memory.setPendingOffer(instagramUserId, draft.pendingOffer);
    } else if (draft.stage === "matched" || draft.stage === "soft_match") {
      // keep pending if follow-up set it; otherwise clear stale offers when fully answered
      if (!draft.nextQuestion) this.memory.setPendingOffer(instagramUserId, null);
    }

    if (this.llm && options.useLlm !== false && packs.length) {
      const polished = await polishReplyWithModel(this.llm, {
        buyer,
        packs,
        draftText: draft.text,
        intents
      });
      if (polished) draft = { ...draft, text: polished, polished: true };
    }

    const allowedBuyerAmounts = [buyer.budgetAed, buyer.cashAvailableAed].filter(
      (value) => value !== null && value !== undefined
    );

    let check = validateMessage(draft.text, packs, {
      handoffRequested,
      handoffReason: handoffRequested ? "buyer_requested" : null,
      allowedBuyerAmounts
    });

    let replyText = draft.text;
    if (!check.ok) {
      replyText = packs.length
        ? fallbackSafeText(packs)
        : "I can only share confirmed listing details. Tell me a budget and area and I will check what we have.";
      check = validateMessage(replyText, packs, {
        handoffRequested,
        handoffReason: handoffRequested ? "buyer_requested" : null,
        allowedBuyerAmounts
      });
      draft = { ...draft, text: replyText, stage: "fact_check_fallback", polished: false };
    }

    const status = leadStatusFor(buyer, intents, matchResult.matchCount);
    const summary = this.memory.buildSummary(instagramUserId, {
      ...buyer,
      conversationSummary: summarizeBuyer(buyer)
    });

    buyer = await this.buyers.remember(instagramUserId, {
      intentSignals: signals.length ? signals : undefined,
      contactDeclined: intents.includes("decline_contact") ? true : undefined
    });
    buyer = await this.buyers.updateMeta(instagramUserId, {
      leadStatus: status,
      conversationSummary: summary,
      followUpStatus: highIntent && !buyer.contactDeclined ? "pending_advisor" : buyer.followUpStatus || "none"
    });

    this.memory.addTurn(instagramUserId, {
      role: "assistant",
      text: replyText,
      stage: draft.stage,
      matchCount: matchResult.matchCount,
      factCheckOk: check.ok,
      pendingOffer: this.memory.getPendingOffer(instagramUserId)
    });

    return {
      reply: replyText,
      stage: draft.stage,
      buyer,
      intents,
      signals,
      criteria: matchResult.criteria,
      matchCount: matchResult.matchCount,
      matchMode: matchResult.mode,
      matches: matchResult.matches,
      mismatches: matchResult.mismatches || [],
      packs,
      check,
      missingData: missingDataHandoff(packs),
      handoffRequired: check.handoffRequired,
      nextQuestion: draft.nextQuestion || null,
      pendingOffer: this.memory.getPendingOffer(instagramUserId),
      context: this.memory.recentContext(instagramUserId)
    };
  }
}

export function createConversationEngine(services, options = {}) {
  return new ConversationEngine({
    buyers: services.buyers,
    properties: services.properties,
    memory: options.memory,
    llm: options.llm || null
  });
}
