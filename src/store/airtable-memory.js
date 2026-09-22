function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return data;
    },
    async text() {
      return JSON.stringify(data);
    }
  };
}

export class MemoryAirtableApi {
  constructor({ baseId = "appAbuDhabiListings" } = {}) {
    this.baseId = baseId;
    this.tables = new Map();
    this.seq = 1;
  }

  nextId() {
    return `rec${String(this.seq++).padStart(14, "0")}`;
  }

  table(name) {
    if (!this.tables.has(name)) this.tables.set(name, new Map());
    return this.tables.get(name);
  }

  fetch = async (url, options = {}) => {
    const method = (options.method || "GET").toUpperCase();
    const parsed = new URL(url, "https://api.airtable.com");
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] !== "v0") {
      return jsonResponse({ error: { message: "not found" } }, 404);
    }
    const tableName = decodeURIComponent(parts[2] || "");
    const recordId = parts[3];
    const body = options.body ? JSON.parse(options.body) : null;
    const table = this.table(tableName);

    if (method === "GET" && !recordId) {
      return jsonResponse({ records: [...table.values()] });
    }

    if (method === "POST") {
      const incoming = body.records || [{ fields: body.fields || {} }];
      const records = incoming.map((row) => {
        const record = {
          id: this.nextId(),
          createdTime: new Date().toISOString(),
          fields: { ...(row.fields || {}) }
        };
        table.set(record.id, record);
        return record;
      });
      return jsonResponse({ records });
    }

    if (method === "PATCH" && recordId) {
      const existing = table.get(recordId);
      if (!existing) return jsonResponse({ error: { message: "not found" } }, 404);
      existing.fields = { ...existing.fields, ...(body.fields || {}) };
      table.set(recordId, existing);
      return jsonResponse(existing);
    }

    return jsonResponse({ error: { message: "unsupported" } }, 400);
  };
}
