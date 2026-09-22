const thread = document.getElementById("thread");
const form = document.getElementById("form");
const messageInput = document.getElementById("message");
const userIdInput = document.getElementById("userId");
const choicesEl = document.getElementById("choices");
const buyerBtn = document.getElementById("buyerBtn");
const buyerPanel = document.getElementById("buyerPanel");
const settings = document.getElementById("settings");
const settingsToggle = document.getElementById("settingsToggle");

function addBubble(role, text, meta = "") {
  const row = document.createElement("div");
  row.className = `row ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  row.appendChild(bubble);

  if (meta) {
    const metaEl = document.createElement("div");
    metaEl.className = "meta-line";
    metaEl.textContent = meta;
    row.appendChild(metaEl);
  }

  thread.appendChild(row);
  thread.scrollTop = thread.scrollHeight;
}

function renderChoices(nextQuestion) {
  choicesEl.innerHTML = "";
  if (!nextQuestion?.choices?.length) {
    choicesEl.hidden = true;
    return;
  }
  choicesEl.hidden = false;
  for (const choice of nextQuestion.choices) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = choice.label;
    btn.addEventListener("click", () => {
      messageInput.value = choice.label;
      form.requestSubmit();
    });
    choicesEl.appendChild(btn);
  }
}

async function sendMessage(text) {
  const userId = userIdInput.value.trim() || "ig_web_demo";
  addBubble("you", text);
  messageInput.value = "";
  choicesEl.hidden = true;

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, message: text })
  });
  const data = await response.json();
  if (!response.ok) {
    addBubble("bot", data.error || "Request failed");
    return;
  }

  const metaParts = [];
  if (data.matchCount) metaParts.push(`${data.matchCount} match${data.matchCount === 1 ? "" : "es"}`);
  if (data.factCheckOk === false) metaParts.push("fact check blocked");
  if (data.leadStatus && data.leadStatus !== "new") metaParts.push(data.leadStatus.replaceAll("_", " "));

  addBubble("bot", data.reply, metaParts.join(" · "));
  renderChoices(data.nextQuestion);
}

settingsToggle.addEventListener("click", () => {
  const open = settings.hasAttribute("hidden");
  if (open) {
    settings.removeAttribute("hidden");
    settingsToggle.setAttribute("aria-expanded", "true");
  } else {
    settings.setAttribute("hidden", "");
    settingsToggle.setAttribute("aria-expanded", "false");
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;
  sendMessage(text).catch((error) => addBubble("bot", error.message || String(error)));
});

buyerBtn.addEventListener("click", async () => {
  const userId = userIdInput.value.trim() || "ig_web_demo";
  const response = await fetch(`/api/buyer?userId=${encodeURIComponent(userId)}`);
  const data = await response.json();
  buyerPanel.hidden = false;
  buyerPanel.textContent = JSON.stringify(data.buyer, null, 2);
});

addBubble(
  "bot",
  "Hi. I can help with Abu Dhabi listings from the approved list.\n\nShare a budget, area, or bedroom count whenever you are ready."
);

messageInput.focus();
