const AREA_ALIASES = {
  yas: "Yas Island",
  "yas island": "Yas Island",
  "yas isalnd": "Yas Island",
  hudayriyat: "Hudayriyat Island",
  "al hudayriyat": "Hudayriyat Island",
  "hudayriyat island": "Hudayriyat Island",
  "al hudayriyat island": "Hudayriyat Island",
  saadiyat: "Saadiyat Island",
  "saadiyat island": "Saadiyat Island",
  "al reem": "Al Reem Island",
  "reem island": "Al Reem Island",
  "al reem island": "Al Reem Island"
};

const TYPE_ALIASES = {
  apt: "apartment",
  apartment: "apartment",
  apartments: "apartment",
  flat: "apartment",
  villa: "villa",
  villas: "villa",
  townhouse: "townhouse",
  townhouses: "townhouse",
  th: "townhouse",
  penthouse: "penthouse",
  penthouses: "penthouse",
  studio: "studio",
  studios: "studio"
};

export function normalizeArea(value) {
  if (!value) return null;
  const key = String(value).trim().toLowerCase();
  return AREA_ALIASES[key] || titleCase(String(value).trim());
}

export function normalizeDeveloper(value) {
  if (!value) return null;
  return String(value).trim();
}

export function normalizePropertyType(value) {
  if (!value) return null;
  const key = String(value).trim().toLowerCase();
  if (key === "studio") return "studio";
  return TYPE_ALIASES[key] || key;
}

export function normalizeBedrooms(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value).trim().toLowerCase();
  if (text === "studio" || text === "studios") return 0;
  const match = text.match(/(\d+)/);
  if (!match) return null;
  return Number(match[1]);
}

export function bedroomLabel(bedrooms) {
  if (bedrooms === 0) return "studio";
  if (bedrooms === 1) return "1 bedroom";
  return `${bedrooms} bedroom`;
}

export function parseMoney(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  let text = String(value).trim().toUpperCase().replace(/,/g, "");
  text = text.replace(/AED|DHS|DH|USD|\$/g, "").trim();
  const million = text.match(/^(\d+(?:\.\d+)?)\s*M$/);
  if (million) return Math.round(Number(million[1]) * 1_000_000);
  const thousand = text.match(/^(\d+(?:\.\d+)?)\s*K$/);
  if (thousand) return Math.round(Number(thousand[1]) * 1_000);
  const number = Number(text.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(number)) return null;
  return Math.round(number);
}

export function formatAed(amount) {
  if (amount === null || amount === undefined) return null;
  return `AED ${Number(amount).toLocaleString("en-US")}`;
}

export function titleCase(value) {
  return value
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function sameText(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}
