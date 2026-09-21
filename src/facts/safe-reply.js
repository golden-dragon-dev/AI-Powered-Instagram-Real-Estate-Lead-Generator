import { missingCommercialFields } from "./retrieval.js";

function line(label, packField, fallback) {
  if (packField.confirmed) return `${label}: ${packField.value}`;
  return `${label}: ${fallback}`;
}

export function renderSafeReply(packs) {
  if (!packs.length) {
    return {
      text: "I do not have a confirmed match in the current approved list for those filters. I can widen area or bedrooms if you want.",
      handoffRequired: false
    };
  }

  const blocks = packs.map((pack) => {
    const missing = missingCommercialFields(pack);
    const rows = [
      `${pack.name.value} by ${pack.developer.value}`,
      `Area: ${pack.area.value}`,
      pack.bedrooms.value === 0
        ? "Type: studio"
        : `Type: ${pack.bedroomLabel.value} ${pack.propertyType.value}`,
      line("Starting price", pack.startingPriceText, "not confirmed yet"),
      line("Initial payment", pack.downPaymentText, "not confirmed yet"),
      pack.paymentPlanAvailable.value
        ? line("Payment plan", pack.paymentPlanSummary, "listed as available. The split is not confirmed yet")
        : "Payment plan: not confirmed for this project",
      line("Handover", pack.handover, "not confirmed yet"),
      line("Availability", pack.availability, "not confirmed yet")
    ];
    if (missing.length) {
      rows.push("I can keep helping with what is confirmed. Missing figures are not estimated.");
    }
    return rows.join("\n");
  });

  return {
    text: `Confirmed from the approved list:\n\n${blocks.join("\n\n")}`,
    handoffRequired: false
  };
}
