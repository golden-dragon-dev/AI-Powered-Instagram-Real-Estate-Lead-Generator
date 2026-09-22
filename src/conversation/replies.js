import { renderSafeReply } from "../facts/safe-reply.js";
import { answerFactQuestion } from "./fact-answers.js";
import { isCoreQualified, nextQualificationQuestion, summarizeBuyer } from "./qualify.js";

export function buildConversationReply({
  buyer,
  message = "",
  intents = [],
  packs = [],
  matchCount = 0,
  highIntent = false,
  handoffRequested = false
}) {
  const lines = [];
  const greet = intents.includes("greet");
  const thanks = intents.includes("thanks");
  const declineContact = intents.includes("decline_contact") || Boolean(buyer.contactDeclined);

  if (greet) {
    lines.push("Hello. I can help with Abu Dhabi listings from our approved list.");
  }
  if (thanks) {
    lines.push("You are welcome.");
  }
  if (intents.includes("decline_contact")) {
    lines.push("No problem. We can keep going with the listings without your phone number.");
  }
  if ((handoffRequested || highIntent) && !declineContact) {
    lines.push(
      "I can note this for an advisor. I will keep using only confirmed listing details until then."
    );
  }

  if (!isCoreQualified(buyer)) {
    const question = nextQualificationQuestion(buyer, {
      includeCash: Boolean(buyer.budgetAed),
      includeFinancing: Boolean(buyer.budgetAed && (buyer.preferredAreas?.length || buyer.projectInterest))
    });
    if (buyer.budgetAed || buyer.preferredAreas?.length || buyer.bedrooms?.length) {
      lines.push(`I have noted: ${summarizeBuyer(buyer)}.`);
    }
    if (question) lines.push(formatQuestion(question));
    return {
      text: lines.filter(Boolean).join("\n\n"),
      stage: "qualifying",
      nextQuestion: question,
      handoffRequired: false
    };
  }

  if (matchCount === 0) {
    lines.push(
      "I do not have a confirmed match in the current approved list for those filters. I can widen area or bedrooms if you want."
    );
    return {
      text: lines.filter(Boolean).join("\n\n"),
      stage: "no_match",
      nextQuestion: null,
      handoffRequired: false
    };
  }

  const factAsk = intents.includes("ask_facts")
    ? answerFactQuestion(message, packs)
    : { handled: false };

  if (factAsk.handled) {
    lines.push(factAsk.text);
  } else {
    lines.push(renderSafeReply(packs).text);
  }

  if (highIntent && !declineContact) {
    const contact = nextQualificationQuestion(buyer, { includeContact: true });
    if (contact) {
      lines.push(formatQuestion(contact));
      return {
        text: lines.filter(Boolean).join("\n\n"),
        stage: "high_intent",
        nextQuestion: contact,
        handoffRequired: false
      };
    }
    lines.push("Thanks. An advisor can follow up on the confirmed options above.");
    return {
      text: lines.filter(Boolean).join("\n\n"),
      stage: "ready_for_handoff",
      nextQuestion: null,
      handoffRequired: false
    };
  }

  if (highIntent && declineContact) {
    lines.push("I will keep helping with confirmed listing details only.");
  }

  if (!factAsk.handled) {
    if (!buyer.cashAvailableAed) {
      lines.push("If you share how much cash you can put toward the initial payment, I can refine this.");
    } else if (!buyer.financing || buyer.financing === "unknown") {
      const financingQ = nextQualificationQuestion(
        { ...buyer, financing: "unknown" },
        { includeFinancing: true }
      );
      if (financingQ?.field === "financing") lines.push(formatQuestion(financingQ));
    }
  }

  return {
    text: lines.filter(Boolean).join("\n\n"),
    stage: factAsk.handled ? "fact_answer" : "matched",
    nextQuestion: null,
    handoffRequired: false
  };
}

function formatQuestion(question) {
  if (!question) return "";
  if (question.choices?.length) {
    const labels = question.choices.map((choice) => choice.label).join(" / ");
    return `${question.prompt}\nChoices: ${labels}`;
  }
  return question.prompt;
}

export function fallbackSafeText(packs) {
  return renderSafeReply(packs).text;
}
