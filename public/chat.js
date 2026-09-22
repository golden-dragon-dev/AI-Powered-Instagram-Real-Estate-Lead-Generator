const thread = document.getElementById("thread");
const form = document.getElementById("form");
const messageInput = document.getElementById("message");
const userIdInput = document.getElementById("userId");
const choicesEl = document.getElementById("choices");
const buyerBtn = document.getElementById("buyerBtn");
const buyerPanel = document.getElementById("buyerPanel");

function addBubble(role, text, meta = "") {
  const el = document.createElement("div");
  el.className = `bubble ${role}`;
  el.textContent = text;
  if (meta) {
    const metaEl = document.createElement("div");
    metaEl.className = "meta-line";
    metaEl.textContent = meta;
    el.appendChild(metaEl);
  }
  thread.appendChild(el);
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
  const meta = `stage ${data.stage} · matches ${data.matchCount} · fact-check ${data.factCheckOk ? "ok" : "blocked"} · lead ${data.leadStatus}`;
  addBubble("bot", data.reply, meta);
  renderChoices(data.nextQuestion);
}

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
  "Test chat ready. Try the client scenarios in order, or tap a choice when one appears.\nKeep the same test buyer id to check memory."
);
