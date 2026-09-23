import { answerFactQuestion } from "./fact-answers.js";
import { resolveAffirmation, isAffirmation } from "./affirmation.js";
import { bedroomOptionsFromMatches, canPitchBuyer } from "./match-resolve.js";
import { renderProjectIntro } from "./project-copy.js";
import { nextQualificationQuestion, isCoreQualified } from "./qualify.js";
import { choicesForField } from "./choices.js";

/** Pure greeting with no other request in the same message. */
export function isGreetingOnly(message) {
  return /^\s*(hi|hello|hey|good\s+(morning|afternoon|evening)|salam|assalamu?\s*alaikum)[!?.]*\s*$/i.test(
    String(message || "")
  );
}

export function buildConversationReply({
  buyer,
  message = "",
  intents = [],
  packs = [],
  matches = [],
  matchMode = "none",
  mismatches = [],
  highIntent = false,
  handoffRequested = false,
  pendingOffer = null
}) {
  const lines = [];
  const declineContact = intents.includes("decline_contact") || Boolean(buyer.contactDeclined);
  let nextPending = null;
  let nextQuestion = null;

  if (intents.includes("start_fresh")) {
    lines.push("Fresh start. What budget are you working with?");
    nextQuestion = {
      field: "budgetAed",
      prompt: "What budget are you working with?",
      choices: null
    };
    return finish(lines, "qualifying", nextQuestion, null);
  }

  if (intents.includes("greet")) {
    lines.push("Hi. Happy to help with Abu Dhabi off-plan options.");
  }
  if (intents.includes("thanks")) {
    lines.push("Glad to help.");
  }
  if (intents.includes("decline_contact")) {
    lines.push("No problem. We can keep looking without a phone number.");
  }
  if ((handoffRequested || highIntent) && !declineContact) {
    lines.push("I can flag this for an advisor while we stay with confirmed figures.");
  }

  // "Hi" alone must not dump a soft match from an earlier test session.
  if (isGreetingOnly(message) && intents.includes("greet") && !intents.includes("continue")) {
    if (canPitchBuyer(buyer) || Boolean(buyer.projectInterest)) {
      lines.push("Want to continue with your last search, or start fresh?");
      nextQuestion = {
        field: "session_choice",
        prompt: "Want to continue with your last search, or start fresh?",
        choices: [
          { id: "continue", label: "Continue", value: "Continue" },
          { id: "start_fresh", label: "Start fresh", value: "Start fresh" }
        ]
      };
      nextPending = { type: "session_choice" };
      return finish(lines, "welcome_back", nextQuestion, nextPending);
    }
    lines.push("What budget are you working with?");
    nextQuestion = {
      field: "budgetAed",
      prompt: "What budget are you working with?",
      choices: null
    };
    return finish(lines, "qualifying", nextQuestion, null);
  }

  if (isAffirmation(message) && pendingOffer) {
    const resolved = resolveAffirmation(pendingOffer, message);
    if (resolved?.clarify) {
      lines.push(resolved.clarify.prompt);
      nextQuestion = {
        field: resolved.clarify.field,
        prompt: resolved.clarify.prompt,
        choices: resolved.clarify.choices
      };
      nextPending = pendingOffer;
      return finish(lines, "clarify", nextQuestion, nextPending);
    }
  }

  if (intents.includes("ask_facts") && packs.length) {
    const factAsk = answerFactQuestion(message, packs);
    if (factAsk.handled) {
      lines.push(factAsk.text);
      return finish(lines, "fact_answer", null, pendingOffer);
    }
  }

  const readyToPitch = canPitchBuyer(buyer) || Boolean(buyer.projectInterest);

  if (readyToPitch && packs.length) {
    const intro = renderProjectIntro({
      buyer,
      packs,
      mode: matchMode,
      mismatches
    });
    if (intro) lines.push(intro);

    const followUp = buildContextualFollowUp(buyer, matches, packs);
    if (followUp.text) lines.push(followUp.text);
    nextQuestion = followUp.nextQuestion;
    nextPending = followUp.pendingOffer;

    if (highIntent && !declineContact) {
      const contact = nextQualificationQuestion(buyer, { includeContact: true });
      if (contact) {
        lines.push(softContactPrompt(contact));
        nextQuestion = contact;
      }
    } else if (highIntent && declineContact) {
      lines.push("I can keep sharing confirmed details here.");
    }

    return finish(lines, matchMode === "exact" ? "matched" : "soft_match", nextQuestion, nextPending);
  }

  if (readyToPitch && !packs.length) {
    lines.push(
      "I do not have a confirmed option that fits those details yet. If you like, I can look at nearby bedroom sizes or another Abu Dhabi area with verified stock."
    );
    nextQuestion = {
      field: "preferredAreas",
      prompt: "Want me to check another area, or loosen the bedroom size?",
      choices: [
        ...(choicesForField("preferredAreas")?.choices || []),
        { id: "loosen_beds", label: "Show nearby bedroom sizes", value: "nearby bedrooms" }
      ]
    };
    return finish(lines, "no_match", nextQuestion, null);
  }

  // Not enough to pitch yet: ask one natural question, no "I have noted"
  const question = nextQualificationQuestion(buyer, {
    includeCash: false,
    includeFinancing: false
  });
  if (!buyer.budgetAed) {
    lines.push("What budget are you working with?");
    nextQuestion = question || {
      field: "budgetAed",
      prompt: "What budget are you working with?",
      choices: null
    };
  } else if (!(buyer.preferredAreas?.length || buyer.projectInterest)) {
    const areaGroup = choicesForField("preferredAreas");
    lines.push("Which area are you leaning toward?");
    nextQuestion = question || {
      field: "preferredAreas",
      prompt: "Which area are you leaning toward?",
      choices: areaGroup?.choices || null
    };
  } else {
    lines.push(question?.prompt || "What size are you after?");
    nextQuestion = question;
  }

  return finish(lines, "qualifying", nextQuestion, null);
}

function buildContextualFollowUp(buyer, matches, packs) {
  const hasBeds = Boolean(buyer.bedrooms?.length);
  const beds = bedroomOptionsFromMatches(matches);

  if (!hasBeds && beds.length) {
    if (beds.length === 1) {
      return {
        text: `I can open the ${beds[0] === 0 ? "studio" : `${beds[0]} bedroom`} option in more detail if you want.`,
        nextQuestion: {
          field: "bedrooms",
          prompt: "Want me to open that size?",
          choices: [
            {
              id: String(beds[0]),
              label: beds[0] === 0 ? "Studio" : `${beds[0]} bedroom${beds[0] === 1 ? "" : "s"}`,
              value: beds[0]
            }
          ]
        },
        pendingOffer: {
          type: "bedroom_choice",
          options: beds,
          clarifyPrompt: "Should I open that size?"
        }
      };
    }

    const labels = beds.map((n) => (n === 0 ? "studio" : `${n}BR`));
    const prompt = `Are you looking for ${labels.slice(0, -1).join(", ")} or ${labels.at(-1)}, or should I show you both?`;
    return {
      text: prompt,
      nextQuestion: {
        field: "bedrooms",
        prompt,
        choices: [
          ...beds.map((n) => ({
            id: String(n),
            label: n === 0 ? "Studio" : `${n} bedroom${n === 1 ? "" : "s"}`,
            value: n
          })),
          { id: "both", label: "Show both", value: "both" }
        ]
      },
      pendingOffer: {
        type: "bedroom_choice",
        options: beds,
        clarifyPrompt: `Which size should I open: ${labels.join(" or ")}?`
      }
    };
  }

  if (!buyer.cashAvailableAed) {
    return {
      text: "How much cash can you put in for the initial payment?",
      nextQuestion: {
        field: "cashAvailableAed",
        prompt: "How much cash can you put in for the initial payment?",
        choices: null
      },
      pendingOffer: null
    };
  }

  if (!buyer.financing || buyer.financing === "unknown") {
    const financing = choicesForField("financing");
    return {
      text: financing?.prompt || "Do you prefer cash, mortgage, or a payment plan?",
      nextQuestion: {
        field: "financing",
        prompt: financing?.prompt || "Do you prefer cash, mortgage, or a payment plan?",
        choices: financing?.choices || null
      },
      pendingOffer: null
    };
  }

  if (packs.length > 1 && isCoreQualified(buyer)) {
    const names = [...new Set(packs.map((pack) => pack.name.value))];
    if (names.length > 1) {
      return {
        text: "Want me to compare these side by side, or focus on one?",
        nextQuestion: {
          field: "projectInterest",
          prompt: "Which project should I focus on?",
          choices: names.map((name) => ({ id: name, label: name, value: name }))
        },
        pendingOffer: {
          type: "project_choice",
          options: names.map((name) => ({ id: name, name }))
        }
      };
    }
  }

  return { text: null, nextQuestion: null, pendingOffer: null };
}

function softContactPrompt(contact) {
  if (contact.field === "phone") return "If you want an advisor to follow up, what number works best?";
  if (contact.field === "name") return "What name should I put on the enquiry?";
  return contact.prompt;
}

function finish(lines, stage, nextQuestion, pendingOffer) {
  return {
    text: lines.filter(Boolean).join("\n\n"),
    stage,
    nextQuestion: nextQuestion || null,
    pendingOffer: pendingOffer || null,
    handoffRequired: false
  };
}

export function fallbackSafeText(packs) {
  if (!packs.length) {
    return "I can only share confirmed listing details. Tell me a budget and area and I will check what we have.";
  }
  return packs.map((pack) => {
    const bits = [pack.name?.value, pack.developer?.value ? `by ${pack.developer.value}` : null]
      .filter(Boolean)
      .join(" ");
    const price = pack.startingPriceText?.confirmed
      ? `from ${pack.startingPriceText.value}`
      : "starting price not confirmed yet";
    return `${bits} · ${price}`;
  }).join("\n");
}
