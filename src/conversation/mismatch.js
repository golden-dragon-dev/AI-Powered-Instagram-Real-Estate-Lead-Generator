import { bedroomLabel } from "../matching/normalize.js";

function formatAed(amount) {
  return `AED ${Number(amount).toLocaleString("en-US")}`;
}

/**
 * Compare buyer requirements to a confirmed match and list clear gaps.
 * Soft matches must never sound like exact matches.
 */
export function describeRequirementGaps(buyer, match) {
  const gaps = [];
  if (!buyer || !match) return gaps;

  const wantedBeds = buyer.bedrooms?.[0];
  if (wantedBeds !== undefined && wantedBeds !== null && Number(match.unit.bedrooms) !== Number(wantedBeds)) {
    gaps.push(
      `You asked for ${bedroomLabel(wantedBeds)}. This option is ${bedroomLabel(match.unit.bedrooms)}.`
    );
  }

  const wantedType = buyer.propertyTypes?.[0];
  if (wantedType) {
    const unitType = match.unit.bedrooms === 0 ? "studio" : match.unit.propertyType;
    if (wantedType === "studio") {
      if (match.unit.bedrooms !== 0) {
        gaps.push(`You asked for a studio. This option is a ${bedroomLabel(match.unit.bedrooms)} ${match.unit.propertyType}.`);
      }
    } else if (unitType !== wantedType) {
      gaps.push(`You asked for a ${wantedType}. This option is a ${unitType}.`);
    }
  }

  if (
    buyer.cashAvailableAed !== null &&
    buyer.cashAvailableAed !== undefined &&
    match.downPaymentAed !== null &&
    match.downPaymentAed !== undefined &&
    match.downPaymentAed > buyer.cashAvailableAed
  ) {
    gaps.push(
      `You said ${formatAed(buyer.cashAvailableAed)} is available now. This unit needs ${formatAed(match.downPaymentAed)} initially.`
    );
  }

  if (buyer.financing === "payment_plan" && !match.project.paymentPlanAvailable) {
    gaps.push("You asked for a payment plan. This project does not have a confirmed payment plan.");
  }

  if (
    buyer.budgetAed !== null &&
    buyer.budgetAed !== undefined &&
    match.unit.startingPriceAed !== null &&
    match.unit.startingPriceAed !== undefined &&
    match.unit.startingPriceAed > buyer.budgetAed
  ) {
    gaps.push(
      `Your budget is ${formatAed(buyer.budgetAed)}. This unit starts at ${formatAed(match.unit.startingPriceAed)}.`
    );
  }

  const wantedArea = buyer.preferredAreas?.[0];
  if (wantedArea && match.project.area && wantedArea.toLowerCase() !== String(match.project.area).toLowerCase()) {
    gaps.push(`You asked for ${wantedArea}. This project is in ${match.project.area}.`);
  }

  return gaps;
}

export function summarizeRelaxedFields(buyer, matches) {
  const fields = new Set();
  for (const match of matches || []) {
    const gaps = describeRequirementGaps(buyer, match);
    for (const gap of gaps) {
      if (/bedroom|studio/i.test(gap)) fields.add("bedrooms");
      if (/available now|initially/i.test(gap)) fields.add("cash");
      if (/payment plan/i.test(gap)) fields.add("payment_plan");
      if (/budget/i.test(gap)) fields.add("budget");
      if (/asked for .*This project is in/i.test(gap) || /area/i.test(gap) && /project is in/i.test(gap)) {
        fields.add("area");
      }
      if (/asked for a (apartment|villa|townhouse|studio)/i.test(gap)) fields.add("property_type");
    }
  }
  return [...fields];
}
