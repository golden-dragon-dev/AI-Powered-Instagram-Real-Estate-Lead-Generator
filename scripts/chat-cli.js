import readline from "node:readline";
import { loadEnv } from "./load-env.js";
import { createCatalogStore } from "../src/store/create-store.js";
import { BuyerService } from "../src/services/buyer-service.js";
import { PropertyService } from "../src/services/property-service.js";
import { ConversationEngine } from "../src/conversation/engine.js";
import { createAnthropicClient } from "../src/conversation/llm.js";

loadEnv();

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

const userId = arg("user", "ig_test_demo");
const once = arg("message", null);
const jsonMode = process.argv.includes("--json");
const useLlm = process.argv.includes("--llm");

const store = await createCatalogStore();
const buyers = new BuyerService(store);
const properties = new PropertyService(store);
const llm = useLlm ? createAnthropicClient() : null;
const engine = new ConversationEngine({ buyers, properties, llm });

if (useLlm && !llm) {
  console.error("ANTHROPIC_API_KEY is not set. Continuing with template replies.");
}

async function printResult(result) {
  if (jsonMode) {
    console.log(JSON.stringify({
      source: store.source || "local",
      userId,
      stage: result.stage,
      matchCount: result.matchCount,
      leadStatus: result.buyer.leadStatus,
      buyer: {
        budgetAed: result.buyer.budgetAed,
        cashAvailableAed: result.buyer.cashAvailableAed,
        preferredAreas: result.buyer.preferredAreas,
        bedrooms: result.buyer.bedrooms,
        financing: result.buyer.financing,
        intentSignals: result.buyer.intentSignals
      },
      factCheckOk: result.check.ok,
      violations: result.check.violations,
      reply: result.reply
    }, null, 2));
    return;
  }

  console.log("");
  console.log(`stage: ${result.stage} | matches: ${result.matchCount} | lead: ${result.buyer.leadStatus} | fact-check: ${result.check.ok ? "ok" : "blocked"}`);
  console.log(result.reply);
  console.log("");
}

async function runOnce(message) {
  const result = await engine.handleMessage(userId, message, { useLlm });
  await printResult(result);
}

if (once) {
  await runOnce(once);
  process.exit(0);
}

console.log(`Test chat ready (source: ${store.source || "local"}). User id: ${userId}`);
console.log("Type a buyer message. Commands: /buyer  /quit");
console.log("");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function prompt() {
  rl.question("you> ", async (line) => {
    const text = line.trim();
    if (!text) return prompt();
    if (text === "/quit" || text === "/exit") {
      rl.close();
      return;
    }
    if (text === "/buyer") {
      const buyer = store.getBuyer(userId);
      console.log(JSON.stringify(buyer, null, 2));
      return prompt();
    }
    try {
      const result = await engine.handleMessage(userId, text, { useLlm });
      await printResult(result);
    } catch (error) {
      console.error(error.message || error);
    }
    prompt();
  });
}

prompt();
