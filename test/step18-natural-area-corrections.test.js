import assert from "node:assert/strict";
import test from "node:test";
import { extractFactsFromMessage } from "../src/conversation/extract.js";
import { setupConversation } from "./helpers.js";

/**
 * Human phrasing regression matrix for area changes.
 * Run: node --test test/step18-natural-area-corrections.test.js
 */

const extractionCases = [
  ["What about Masdar?", "Masdar City"],
  ["how about masdar city", "Masdar City"],
  ["switch to Masdar", "Masdar City"],
  ["Can we try Masdar?", "Masdar City"],
  ["I prefer Masdar", "Masdar City"],
  ["Masdar instead", "Masdar City"],
  ["Masdar please", "Masdar City"],
  ["Maybe Masdar", "Masdar City"],
  ["Do you have anything in Masdar City?", "Masdar City"],
  ["Let's consider Masdar", "Masdar City"],
  ["I'm looking in Masdar City", "Masdar City"],
  ["Can we move this to Masdar City?", "Masdar City"],
  ["Instead, can we see Masdar?", "Masdar City"],
  ["I am thinking Masdar might suit me", "Masdar City"],
  ["Show me Masdar City options", "Masdar City"],
  ["What about Al Raha Beach?", "Al Raha Beach"],
  ["Try Raha Beach", "Al Raha Beach"],
  ["switch to Al Maryah Island", "Al Maryah Island"],
  ["Maryah please", "Al Maryah Island"],
  ["Khalifa City instead", "Khalifa City"],
  ["look in MBZ City", "Mohammed Bin Zayed City"],
  ["consider Mohammed bin Zayed City", "Mohammed Bin Zayed City"],
  ["what about Mohamed bin Zayed City", "Mohammed Bin Zayed City"],
  ["Al Reef please", "Al Reef"],
  ["try Al Ghadeer", "Al Ghadeer"],
  ["switching to Al Shamkha", "Al Shamkha"],
  ["prefer Al Raha Gardens", "Al Raha Gardens"],
  ["How about Al Bateen?", "Al Bateen"],
  ["Corniche instead", "Corniche"],
  ["What about Reem?", "Al Reem Island"],
  ["Could we try Saadiyat Island?", "Saadiyat Island"],
  ["Hudayriyat please", "Hudayriyat Island"],
  ["Forget Yas. What about Masdar?", "Masdar City"],
  ["Not Yas, Masdar instead", "Masdar City"],
  ["Skip Saadiyat and try Masdar", "Masdar City"],
  ["Ignore Reem and switch to Masdar", "Masdar City"],
  ["No more Yas. Let's look in Masdar", "Masdar City"],
  ["Masdar, not Yas", "Masdar City"],
  ["Forget Al Raha Beach. What about Al Reef?", "Al Reef"],
  ["Skip Maryah Island. Try Khalifa City", "Khalifa City"]
];

for (const [index, [message, expectedArea]] of extractionCases.entries()) {
  test(`step 18 extract ${String(index + 1).padStart(2, "0")} ${message}`, () => {
    const result = extractFactsFromMessage(message);
    assert.equal(result.facts.area, expectedArea);
    assert.ok(result.intents.includes("provide_facts"));
  });
}

const conversationCases = [
  ["What about masdar", "Masdar City"],
  ["Could we look at Masdar City instead?", "Masdar City"],
  ["Actually, try Masdar", "Masdar City"],
  ["Maybe Masdar would be better", "Masdar City"],
  ["Forget Yas. What is there in Masdar?", "Masdar City"],
  ["I changed my mind, Masdar please", "Masdar City"],
  ["Can you check Al Raha Beach?", "Al Raha Beach"],
  ["Let's switch to Raha Beach", "Al Raha Beach"],
  ["What about Al Maryah Island?", "Al Maryah Island"],
  ["Maryah instead please", "Al Maryah Island"],
  ["Could you check Khalifa City?", "Khalifa City"],
  ["Try MBZ City instead", "Mohammed Bin Zayed City"],
  ["What do you have in Al Reef?", "Al Reef"],
  ["Let's look in Al Ghadeer", "Al Ghadeer"],
  ["Switching to Al Shamkha", "Al Shamkha"],
  ["What about Al Raha Gardens?", "Al Raha Gardens"],
  ["Can we try Al Bateen?", "Al Bateen"],
  ["Corniche might work better", "Corniche"],
  ["Forget Yas and check Reem", "Al Reem Island"],
  ["How about Saadiyat Island?", "Saadiyat Island"]
];

for (const [index, [message, expectedArea]] of conversationCases.entries()) {
  test(`step 18 conversation ${String(index + 1).padStart(2, "0")} ${message}`, async () => {
    const { engine } = await setupConversation();
    const userId = `ig_area_correction_${index}`;

    const initial = await engine.handleMessage(userId, "Budget AED 2M, Yas Island, studio");
    assert.match(initial.reply, /Yas Studio One/i);

    const changed = await engine.handleMessage(userId, message);
    assert.deepEqual(changed.buyer.preferredAreas, [expectedArea]);
    assert.equal(changed.matchCount, 0);
    assert.match(changed.reply, new RegExp(expectedArea.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    assert.doesNotMatch(changed.reply, /Yas Studio One/i);
    assert.ok(changed.matches.every((row) => row.project.area === expectedArea));
  });
}

test("step 18 conversation 21 definite correction clears old area flexibility", async () => {
  const { engine } = await setupConversation();
  const userId = "ig_area_correction_flexible";

  await engine.handleMessage(userId, "Budget AED 2M, maybe Yas but open to other areas, studio");
  const changed = await engine.handleMessage(userId, "Actually, only Masdar now");

  assert.deepEqual(changed.buyer.preferredAreas, ["Masdar City"]);
  assert.ok(!changed.buyer.intentSignals.includes("area_flexible"));
  assert.equal(changed.matchCount, 0);
  assert.match(changed.reply, /Masdar City/i);
  assert.doesNotMatch(changed.reply, /Yas Studio One/i);
});
