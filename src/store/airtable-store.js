function airtableHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

function mapSelect(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.name || null;
}

export class AirtableStore {
  constructor(env = process.env) {
    this.apiKey = env.AIRTABLE_API_KEY;
    this.baseId = env.AIRTABLE_BASE_ID;
    this.tables = {
      developers: env.AIRTABLE_DEVELOPERS_TABLE || "Developers",
      projects: env.AIRTABLE_PROJECTS_TABLE || "Projects",
      units: env.AIRTABLE_UNITS_TABLE || "Units"
    };
  }

  enabled() {
    return Boolean(this.apiKey && this.baseId);
  }

  async listTable(table) {
    const records = [];
    let offset;
    do {
      const url = new URL(`https://api.airtable.com/v0/${this.baseId}/${encodeURIComponent(table)}`);
      url.searchParams.set("pageSize", "100");
      if (offset) url.searchParams.set("offset", offset);
      const response = await fetch(url, { headers: airtableHeaders(this.apiKey) });
      if (!response.ok) {
        throw new Error(`Airtable ${table} failed with ${response.status}`);
      }
      const body = await response.json();
      records.push(...body.records);
      offset = body.offset;
    } while (offset);
    return records;
  }

  mapDeveloper(record) {
    const f = record.fields;
    return {
      id: record.id,
      name: f.Name,
      active: Boolean(f.Active)
    };
  }

  mapProject(record, developers) {
    const f = record.fields;
    const developerId = Array.isArray(f.Developer) ? f.Developer[0] : null;
    const developer = developers.find((row) => row.id === developerId);
    return {
      id: record.id,
      name: f.Name,
      developerId,
      developerName: developer ? developer.name : null,
      developerActive: developer ? developer.active : false,
      emirate: mapSelect(f.Emirate),
      area: f.Area,
      propertyTypes: f["Property types"] || [],
      status: mapSelect(f.Status),
      handover: f.Handover || null,
      paymentPlanAvailable: Boolean(f["Payment plan available"]),
      paymentPlanSummary: f["Payment plan summary"] || null,
      initialPaymentAed: f["Required initial payment AED"] ?? null,
      description: f.Description || null,
      features: f.Features || null,
      availabilityNotes: f["Availability notes"] || null,
      source: f.Source || null,
      lastVerified: f["Last verified"] || null,
      active: Boolean(f.Active)
    };
  }

  mapUnit(record) {
    const f = record.fields;
    return {
      id: record.id,
      projectId: Array.isArray(f.Project) ? f.Project[0] : null,
      propertyType: mapSelect(f["Property type"]),
      bedrooms: f.Bedrooms,
      startingPriceAed: f["Starting price AED"] ?? null,
      sizeSqftFrom: f["Size sqft from"] ?? null,
      sizeSqftTo: f["Size sqft to"] ?? null,
      initialPaymentAed: f["Initial payment AED"] ?? null,
      availability: mapSelect(f.Availability),
      active: Boolean(f.Active)
    };
  }

  async loadCatalog() {
    if (!this.enabled()) {
      throw new Error("Airtable is not configured");
    }
    const developerRecords = await this.listTable(this.tables.developers);
    const projectRecords = await this.listTable(this.tables.projects);
    const unitRecords = await this.listTable(this.tables.units);
    const developers = developerRecords.map((row) => this.mapDeveloper(row));
    const projects = projectRecords.map((row) => this.mapProject(row, developers));
    const units = unitRecords.map((row) => this.mapUnit(row));
    return { developers, projects, units };
  }
}
