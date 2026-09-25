const thread = document.getElementById("thread");
const form = document.getElementById("form");
const messageInput = document.getElementById("message");
const userIdInput = document.getElementById("userId");
const apiKeyInput = document.getElementById("apiKey");
const claudeStatus = document.getElementById("claudeStatus");
const choicesEl = document.getElementById("choices");
const callRequestEl = document.getElementById("callRequest");
const callPhoneInput = document.getElementById("callPhone");
const callSubmitBtn = document.getElementById("callSubmit");
const buyerBtn = document.getElementById("buyerBtn");
const newChatBtn = document.getElementById("newChatBtn");
const saveKeyBtn = document.getElementById("saveKeyBtn");
const clearKeyBtn = document.getElementById("clearKeyBtn");
const buyerPanel = document.getElementById("buyerPanel");
const settings = document.getElementById("settings");
const settingsToggle = document.getElementById("settingsToggle");
const runtimeKeyControls = document.querySelectorAll(".runtime-key-control");

const SESSION_KEY = "harbour_desk_test_user";

function newSessionId() {
  return `ig_web_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = newSessionId();
    localStorage.setItem(SESSION_KEY, id);
  }
  userIdInput.value = id;
  return id;
}

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

function clearThread() {
  thread.innerHTML = "";
  choicesEl.innerHTML = "";
  choicesEl.hidden = true;
  hideCallRequest();
  buyerPanel.hidden = true;
}

function hideCallRequest() {
  if (!callRequestEl) return;
  callRequestEl.hidden = true;
  if (callPhoneInput) callPhoneInput.value = "";
}

function renderCallRequest(callRequest) {
  if (!callRequestEl) return;
  if (!callRequest?.offered) {
    hideCallRequest();
    return;
  }
  callRequestEl.hidden = false;
  if (callPhoneInput) {
    callPhoneInput.value = callRequest.phone || "";
    callPhoneInput.focus();
  }
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

function renderClaudeStatus(data) {
  if (!claudeStatus) return;
  for (const control of runtimeKeyControls) {
    control.hidden = !data?.runtimeKeyAllowed;
  }
  if (data?.claudeEnabled) {
    claudeStatus.textContent = "Natural conversation is enabled.";
  } else if (!data?.runtimeKeyAllowed) {
    claudeStatus.textContent = "Natural conversation is not configured on this deployment.";
  } else {
    claudeStatus.textContent = "Add the Anthropic key here to test natural conversation locally.";
  }
}

async function refreshClaudeStatus() {
  try {
    const response = await fetch("/api/llm");
    const data = await response.json();
    renderClaudeStatus(data);
  } catch {
    renderClaudeStatus({ claudeEnabled: false });
  }
}

async function saveApiKey(apiKey) {
  const response = await fetch("/api/llm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apiKey })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Could not save key");
  }
  if (apiKeyInput) apiKeyInput.value = "";
  renderClaudeStatus(data);
  return data;
}

async function sendMessage(text) {
  const userId = userIdInput.value.trim() || ensureSessionId();
  localStorage.setItem(SESSION_KEY, userId);
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

  addBubble("bot", data.reply);
  renderChoices(data.nextQuestion);
  renderCallRequest(data.callRequest);
}

async function submitCallRequest() {
  const userId = userIdInput.value.trim() || ensureSessionId();
  const phone = (callPhoneInput?.value || "").trim();
  if (!phone) {
    addBubble("bot", "Enter a phone number first, then tap Request Call.");
    return;
  }

  addBubble("you", "Request a call");
  const response = await fetch("/api/call-request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, phone })
  });
  const data = await response.json();
  if (!response.ok) {
    addBubble("bot", data.error || "Call request failed");
    return;
  }

  hideCallRequest();
  choicesEl.hidden = true;
  addBubble("bot", data.reply);
}

function startFreshUi() {
  const id = newSessionId();
  localStorage.setItem(SESSION_KEY, id);
  userIdInput.value = id;
  clearThread();
  addBubble(
    "bot",
    "Hi, happy to help. Tell me what you’re looking for in Abu Dhabi, or share your budget and I’ll suggest a few options."
  );
  messageInput.focus();
}

settingsToggle.addEventListener("click", () => {
  const open = settings.hasAttribute("hidden");
  if (open) {
    settings.removeAttribute("hidden");
    settingsToggle.setAttribute("aria-expanded", "true");
    refreshClaudeStatus();
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

if (callSubmitBtn) {
  callSubmitBtn.addEventListener("click", () => {
    submitCallRequest().catch((error) => addBubble("bot", error.message || String(error)));
  });
}

buyerBtn.addEventListener("click", async () => {
  const userId = userIdInput.value.trim() || ensureSessionId();
  const response = await fetch(`/api/buyer?userId=${encodeURIComponent(userId)}`);
  const data = await response.json();
  buyerPanel.hidden = false;
  buyerPanel.textContent = JSON.stringify(data.buyer, null, 2);
});

if (newChatBtn) {
  newChatBtn.addEventListener("click", () => startFreshUi());
}

if (saveKeyBtn) {
  saveKeyBtn.addEventListener("click", () => {
    const apiKey = (apiKeyInput?.value || "").trim();
    if (!apiKey) {
      claudeStatus.textContent = "Paste a key first, then tap Save key.";
      return;
    }
    saveApiKey(apiKey).catch((error) => {
      claudeStatus.textContent = error.message || String(error);
    });
  });
}

if (clearKeyBtn) {
  clearKeyBtn.addEventListener("click", () => {
    saveApiKey("").catch((error) => {
      claudeStatus.textContent = error.message || String(error);
    });
  });
}

ensureSessionId();
refreshClaudeStatus();
addBubble(
  "bot",
  "Hi, happy to help. Tell me what you’re looking for in Abu Dhabi, or share your budget and I’ll suggest a few options."
);

messageInput.focus();
