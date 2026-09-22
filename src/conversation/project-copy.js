/**
 * Natural wording for confirmed project packs. Never invents missing fields.
 */

function money(packField) {
  return packField?.confirmed ? packField.value : null;
}

function sizeLine(pack) {
  if (pack.sizeSqftFrom?.confirmed && pack.sizeSqftTo?.confirmed) {
    return `${pack.sizeSqftFrom.value} to ${pack.sizeSqftTo.value} sqft`;
  }
  if (pack.sizeSqftFrom?.confirmed) return `from ${pack.sizeSqftFrom.value} sqft`;
  return null;
}

function unitLabel(pack) {
  if (pack.bedrooms?.value === 0) return "studio";
  return `${pack.bedroomLabel?.value || ""} ${pack.propertyType?.value || ""}`.trim();
}

export function renderProjectCard(pack) {
  const bits = [];
  const name = pack.name?.value;
  const developer = pack.developer?.value;
  if (name && developer) bits.push(`${name} by ${developer}`);
  else if (name) bits.push(name);

  if (pack.area?.confirmed) bits.push(pack.area.value);
  const unit = unitLabel(pack);
  if (unit) bits.push(unit);

  const price = money(pack.startingPriceText);
  if (price) bits.push(`from ${price}`);
  else bits.push("starting price not confirmed yet");

  const size = sizeLine(pack);
  if (size) bits.push(size);

  const down = money(pack.downPaymentText);
  if (down) bits.push(`initial ${down}`);
  else if (!pack.downPaymentText?.confirmed) bits.push("initial payment not confirmed yet");

  if (pack.paymentPlanSummary?.confirmed) bits.push(pack.paymentPlanSummary.value);
  else if (pack.paymentPlanAvailable?.confirmed && pack.paymentPlanAvailable.value) {
    bits.push("payment plan available, split not confirmed yet");
  }

  if (pack.handover?.confirmed) bits.push(`handover ${pack.handover.value}`);
  else bits.push("handover not confirmed yet");

  return bits.join(" · ");
}

export function renderProjectIntro({ buyer, packs, mode = "exact" }) {
  if (!packs.length) return null;

  const area = buyer.preferredAreas?.[0] || packs[0].area?.value || "Abu Dhabi";
  const budget = buyer.budgetAed
    ? `AED ${Number(buyer.budgetAed).toLocaleString("en-US")}`
    : null;

  const projectNames = [...new Set(packs.map((pack) => pack.name.value))];
  const lead =
    projectNames.length === 1
      ? projectNames[0]
      : projectNames.slice(0, 2).join(" and ");

  let opener;
  if (budget && area) {
    opener =
      mode === "exact"
        ? `${budget} opens a few doors on ${area}. ${lead} is worth a look.`
        : `I do not have an exact fit for every detail yet, but on ${area} around ${budget}, ${lead} is a solid confirmed option.`;
  } else if (area) {
    opener = `On ${area}, ${lead} is worth a look.`;
  } else {
    opener = `${lead} is worth a look.`;
  }

  const cards = packs.slice(0, 3).map(renderProjectCard);
  return `${opener}\n\n${cards.join("\n\n")}`;
}

export function renderFocusedFact(answerText) {
  return answerText;
}
