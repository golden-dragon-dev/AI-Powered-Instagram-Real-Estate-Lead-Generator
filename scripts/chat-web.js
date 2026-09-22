import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./load-env.js";
import { createCatalogStore } from "../src/store/create-store.js";
import { BuyerService } from "../src/services/buyer-service.js";
import { PropertyService } from "../src/services/property-service.js";
import { ConversationEngine } from "../src/conversation/engine.js";
import { ConversationMemory } from "../src/conversation/memory.js";
import { listChoiceGroups } from "../src/conversation/choices.js";
import { createAnthropicClient } from "../src/conversation/llm.js";

loadEnv();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || process.env.CHAT_PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";

const store = await createCatalogStore();
const buyers = new BuyerService(store);
const properties = new PropertyService(store);
const memory = new ConversationMemory();
const llm = process.env.ANTHROPIC_API_KEY ? createAnthropicClient() : null;
const engine = new ConversationEngine({ buyers, properties, memory, llm });

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS"
  });
  res.end(payload);
}

function sendText(res, status, text, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": type,
    "access-control-allow-origin": "*",
    "cache-control": "no-store"
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(urlPath, res) {
  const relative = urlPath === "/" ? "/chat.html" : urlPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, relative));
  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
    sendText(res, 404, "Not found");
    return;
  }
  const ext = path.extname(filePath);
  const type =
    ext === ".html"
      ? "text/html; charset=utf-8"
      : ext === ".css"
        ? "text/css; charset=utf-8"
        : ext === ".js"
          ? "text/javascript; charset=utf-8"
          : "text/plain; charset=utf-8";
  sendText(res, 200, readFileSync(filePath, "utf8"), type);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    return sendJson(res, 204, {});
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      source: store.source || "local",
      milestone: 2
    });
  }

  if (req.method === "GET" && url.pathname === "/api/choices") {
    return sendJson(res, 200, listChoiceGroups());
  }

  if (req.method === "GET" && url.pathname === "/api/buyer") {
    const userId = url.searchParams.get("userId") || "ig_web_demo";
    return sendJson(res, 200, { buyer: store.getBuyer(userId) });
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    try {
      const body = await readBody(req);
      const userId = String(body.userId || "ig_web_demo").trim() || "ig_web_demo";
      const message = String(body.message || "").trim();
      if (!message) return sendJson(res, 400, { error: "message is required" });
      const result = await engine.handleMessage(userId, message, {
        useLlm: Boolean(body.useLlm)
      });
      return sendJson(res, 200, {
        reply: result.reply,
        stage: result.stage,
        matchCount: result.matchCount,
        factCheckOk: result.check.ok,
        leadStatus: result.buyer.leadStatus,
        nextQuestion: result.nextQuestion,
        buyer: {
          budgetAed: result.buyer.budgetAed,
          cashAvailableAed: result.buyer.cashAvailableAed,
          preferredAreas: result.buyer.preferredAreas,
          bedrooms: result.buyer.bedrooms,
          propertyTypes: result.buyer.propertyTypes,
          financing: result.buyer.financing,
          useType: result.buyer.useType,
          contactDeclined: result.buyer.contactDeclined,
          intentSignals: result.buyer.intentSignals
        },
        matches: result.matches.map((row) => ({
          project: row.project.name,
          bedrooms: row.bedroomLabel,
          price: row.unit.startingPriceAed
        }))
      });
    } catch (error) {
      return sendJson(res, 500, { error: error.message || String(error) });
    }
  }

  if (req.method === "GET") {
    return serveStatic(url.pathname, res);
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, HOST, () => {
  const local = `http://127.0.0.1:${PORT}/`;
  console.log(`Milestone 2 test chat running`);
  console.log(`Open ${local}`);
  console.log(`Catalog source: ${store.source || "local"}`);
});
