import { EMIRATES, PROJECT_STATUSES, PROPERTY_TYPES, AVAILABILITY_VALUES } from "../schema/fields.js";

function fail(path, message) {
  return `${path}: ${message}`;
}

export function validateDeveloper(row, path = "developer") {
  const errors = [];
  if (!row.id) errors.push(fail(path, "id is required"));
  if (!row.name) errors.push(fail(path, "name is required"));
  if (typeof row.active !== "boolean") errors.push(fail(path, "active must be boolean"));
  return errors;
}

export function validateProject(row, developers, path = "project") {
  const errors = [];
  if (!row.id) errors.push(fail(path, "id is required"));
  if (!row.name) errors.push(fail(path, "name is required"));
  if (!row.developerId) errors.push(fail(path, "developerId is required"));
  if (row.developerId && !developers.find((d) => d.id === row.developerId)) {
    errors.push(fail(path, `developer ${row.developerId} does not exist`));
  }
  if (!EMIRATES.includes(row.emirate)) errors.push(fail(path, "emirate is invalid"));
  if (!row.area) errors.push(fail(path, "area is required"));
  if (!Array.isArray(row.propertyTypes) || row.propertyTypes.length === 0) {
    errors.push(fail(path, "propertyTypes is required"));
  } else {
    for (const type of row.propertyTypes) {
      if (!PROPERTY_TYPES.includes(type)) errors.push(fail(path, `invalid property type ${type}`));
    }
  }
  if (!PROJECT_STATUSES.includes(row.status)) errors.push(fail(path, "status is invalid"));
  if (typeof row.paymentPlanAvailable !== "boolean") {
    errors.push(fail(path, "paymentPlanAvailable must be boolean"));
  }
  if (typeof row.active !== "boolean") errors.push(fail(path, "active must be boolean"));
  if (row.active) {
    if (!row.source) errors.push(fail(path, "source is required on active projects"));
    if (!row.lastVerified) errors.push(fail(path, "lastVerified is required on active projects"));
  }
  return errors;
}

export function validateUnit(row, projects, path = "unit") {
  const errors = [];
  if (!row.id) errors.push(fail(path, "id is required"));
  if (!row.projectId) errors.push(fail(path, "projectId is required"));
  if (row.projectId && !projects.find((p) => p.id === row.projectId)) {
    errors.push(fail(path, `project ${row.projectId} does not exist`));
  }
  if (!PROPERTY_TYPES.includes(row.propertyType)) errors.push(fail(path, "propertyType is invalid"));
  if (!Number.isInteger(row.bedrooms) || row.bedrooms < 0) {
    errors.push(fail(path, "bedrooms must be an integer >= 0"));
  }
  if (row.propertyType === "studio" && row.bedrooms !== 0) {
    errors.push(fail(path, "studio units must have 0 bedrooms"));
  }
  if (row.bedrooms === 0 && row.propertyType !== "studio") {
    errors.push(fail(path, "0 bedrooms must use propertyType studio"));
  }
  if (row.startingPriceAed !== null && row.startingPriceAed !== undefined) {
    if (!Number.isFinite(row.startingPriceAed) || row.startingPriceAed <= 0) {
      errors.push(fail(path, "startingPriceAed must be a positive number or null"));
    }
  }
  if (row.availability && !AVAILABILITY_VALUES.includes(row.availability)) {
    errors.push(fail(path, "availability is invalid"));
  }
  if (typeof row.active !== "boolean") errors.push(fail(path, "active must be boolean"));
  return errors;
}

export function validateCatalog({ developers, projects, units }) {
  const errors = [];
  developers.forEach((row, i) => errors.push(...validateDeveloper(row, `developers[${i}]`)));
  projects.forEach((row, i) => errors.push(...validateProject(row, developers, `projects[${i}]`)));
  units.forEach((row, i) => errors.push(...validateUnit(row, projects, `units[${i}]`)));
  return errors;
}
