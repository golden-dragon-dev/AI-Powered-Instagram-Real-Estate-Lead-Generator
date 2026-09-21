import { formatAed } from "../matching/normalize.js";

function field(value) {
  const confirmed = value !== null && value !== undefined && value !== "";
  return {
    value: confirmed ? value : null,
    confirmed
  };
}

export function buildFactPack(match) {
  const { project, unit, downPaymentAed, bedroomLabel } = match;
  return {
    projectId: project.id,
    unitId: unit.id,
    name: field(project.name),
    developer: field(project.developerName),
    emirate: field(project.emirate),
    area: field(project.area),
    propertyType: field(unit.propertyType),
    bedrooms: field(unit.bedrooms),
    bedroomLabel: field(bedroomLabel),
    startingPriceAed: field(unit.startingPriceAed),
    startingPriceText: field(formatAed(unit.startingPriceAed)),
    sizeSqftFrom: field(unit.sizeSqftFrom),
    sizeSqftTo: field(unit.sizeSqftTo),
    downPaymentAed: field(downPaymentAed),
    downPaymentText: field(formatAed(downPaymentAed)),
    paymentPlanAvailable: field(project.paymentPlanAvailable),
    paymentPlanSummary: field(project.paymentPlanSummary),
    handover: field(project.handover),
    status: field(project.status),
    availability: field(unit.availability),
    availabilityNotes: field(project.availabilityNotes),
    description: field(project.description),
    features: field(project.features),
    source: field(project.source),
    lastVerified: field(project.lastVerified)
  };
}

export function retrieveFacts(matches) {
  return matches.map(buildFactPack);
}

export function missingCommercialFields(pack) {
  const keys = ["startingPriceAed", "downPaymentAed", "paymentPlanSummary", "handover", "availability"];
  return keys.filter((key) => !pack[key].confirmed);
}

export function collectAllowedClaims(packs) {
  const amounts = new Set();
  const percents = new Set();
  const dates = new Set();
  const availability = new Set();
  const phrases = new Set();

  for (const pack of packs) {
    for (const key of ["startingPriceAed", "downPaymentAed", "sizeSqftFrom", "sizeSqftTo", "bedrooms"]) {
      if (pack[key].confirmed) amounts.add(Number(pack[key].value));
    }
    if (pack.paymentPlanSummary.confirmed) {
      const plan = String(pack.paymentPlanSummary.value);
      for (const percent of plan.match(/\d+(?:\.\d+)?%/g) || []) {
        percents.add(percent.replace(/%/g, ""));
      }
      for (const hit of plan.match(/(\d+(?:\.\d+)?)\s*percent/gi) || []) {
        percents.add(String(hit).match(/\d+(?:\.\d+)?/)[0]);
      }
      for (const pair of plan.match(/\d+\s*\/\s*\d+/g) || []) {
        const compact = pair.replace(/\s+/g, "");
        phrases.add(compact);
        const [left, right] = compact.split("/");
        percents.add(left);
        percents.add(right);
      }
      phrases.add(plan.toLowerCase());
    }
    if (pack.handover.confirmed) {
      const text = String(pack.handover.value);
      for (const hit of text.match(/Q[1-4]\s*20\d{2}|20\d{2}/gi) || []) {
        dates.add(hit.replace(/\s+/g, " ").toUpperCase());
      }
      phrases.add(text.toLowerCase());
    }
    if (pack.availability.confirmed) availability.add(String(pack.availability.value).toLowerCase());
    if (pack.availabilityNotes.confirmed) phrases.add(String(pack.availabilityNotes.value).toLowerCase());
    if (pack.startingPriceText.confirmed) phrases.add(String(pack.startingPriceText.value).toLowerCase());
    if (pack.name.confirmed) phrases.add(String(pack.name.value).toLowerCase());
    if (pack.developer.confirmed) phrases.add(String(pack.developer.value).toLowerCase());
    if (pack.area.confirmed) phrases.add(String(pack.area.value).toLowerCase());
  }

  return { amounts, percents, dates, availability, phrases };
}
