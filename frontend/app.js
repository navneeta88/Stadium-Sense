// Point this at your deployed backend URL (e.g. https://your-app.onrender.com)
// Defaults to localhost for local development.
const API_BASE = window.STADIUMSENSE_API_BASE || "http://localhost:3001";

// ===== Dark / light theme toggle =====
const THEME_KEY = "stadiumsense-theme";
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
}
const savedTheme = localStorage.getItem(THEME_KEY)
  || (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
applyTheme(savedTheme);

document.getElementById("theme-toggle").addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "light" ? "dark" : "light");
});

// ===== View toggle =====
const toggleBtns = document.querySelectorAll(".toggle-btn");
toggleBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    toggleBtns.forEach((b) => { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.getElementById(`view-${btn.dataset.view}`).classList.add("active");
    if (btn.dataset.view === "staff") loadStaffData();
  });
});

// ===== Fan chat =====
const chatLog = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatSend = document.getElementById("chat-send");

let conversation = [];

function appendMessage(role, text) {
  const wrap = document.createElement("div");
  wrap.className = `msg msg-${role === "user" ? "user" : "bot"}`;
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = text;
  wrap.appendChild(bubble);
  chatLog.appendChild(wrap);
  chatLog.scrollTop = chatLog.scrollHeight;
  return bubble;
}

function appendTypingIndicator() {
  const wrap = document.createElement("div");
  wrap.className = "msg msg-bot";
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble typing";
  bubble.innerHTML = `
    <span class="ball-spinner" aria-hidden="true">
      <svg viewBox="0 0 40 40" width="18" height="18">
        <circle cx="20" cy="20" r="18" fill="#fff" stroke="#101828" stroke-width="1.5"/>
        <polygon points="20,9 26,13.5 24,20.5 16,20.5 14,13.5" fill="#101828"/>
        <polygon points="20,9 14,13.5 8,11 11,4" fill="none" stroke="#101828" stroke-width="1.2"/>
        <polygon points="20,9 26,13.5 32,11 29,4" fill="none" stroke="#101828" stroke-width="1.2"/>
        <polygon points="16,20.5 8,22 6,29 12,32" fill="none" stroke="#101828" stroke-width="1.2"/>
        <polygon points="24,20.5 32,22 34,29 28,32" fill="none" stroke="#101828" stroke-width="1.2"/>
      </svg>
    </span>
    <span>StadiumSense is checking the pitch…</span>`;
  wrap.appendChild(bubble);
  chatLog.appendChild(wrap);
  chatLog.scrollTop = chatLog.scrollHeight;
  return bubble;
}

async function sendMessage(text) {
  if (!text.trim()) return;
  appendMessage("user", text);
  conversation.push({ role: "user", content: text });
  chatInput.value = "";
  chatSend.disabled = true;

  const typingBubble = appendTypingIndicator();

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: conversation, language: navigator.language }),
    });
    const data = await res.json();
    typingBubble.parentElement.remove();
    if (data.error) {
      appendMessage("bot", `Error: ${data.error}`);
    } else {
      appendMessage("bot", data.reply);
      conversation.push({ role: "assistant", content: data.reply });
    }
  } catch (err) {
    typingBubble.parentElement.remove();
    appendMessage("bot", "I couldn't reach the StadiumSense backend. Make sure it's running and API_BASE is set correctly.");
  } finally {
    chatSend.disabled = false;
    chatInput.focus();
  }
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage(chatInput.value);
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => sendMessage(chip.dataset.q));
});

// ===== Staff dashboard =====
async function loadStaffData() {
  loadDensity();
  loadSummary();
  loadQueryLog();
}

async function loadDensity() {
  const grid = document.getElementById("density-grid");
  try {
    const res = await fetch(`${API_BASE}/api/crowd`);
    const data = await res.json();
    grid.innerHTML = data.zones
      .map((z) => {
        const card =
          z.status === "critical" ? `<span class="ref-card ref-card-red" title="Critical congestion"></span>`
          : z.status === "high" ? `<span class="ref-card ref-card-yellow" title="High congestion"></span>`
          : "";
        return `
      <div class="density-row status-${z.status}">
        <span class="density-zone">${z.zone.replace(/_/g, " ")}</span>
        <div class="density-track"><div class="density-fill" style="width:${z.density_pct}%"></div></div>
        <span class="density-pct">${z.density_pct}%${card}</span>
      </div>`;
      })
      .join("");
  } catch {
    grid.innerHTML = `<p class="muted">Could not load live crowd data. Is the backend running?</p>`;
  }
}

// Minimal markdown renderer — handles the subset Gemini tends to use in summaries:
// **bold**, bullet lists (*/-), and ### headers. Escapes HTML first to stay safe.
function renderMarkdown(text) {
  const escaped = escapeHtml(text);
  const lines = escaped.split("\n");
  let html = "";
  let inList = false;
  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (/^#{1,4}\s+/.test(line)) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h4>${line.replace(/^#{1,4}\s+/, "")}</h4>`;
    } else if (/^[*-]\s+/.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${line.replace(/^[*-]\s+/, "")}</li>`;
    } else if (line === "") {
      if (inList) { html += "</ul>"; inList = false; }
    } else {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<p>${line}</p>`;
    }
  }
  if (inList) html += "</ul>";
  // bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return html;
}

async function loadSummary() {
  const el = document.getElementById("summary-content");
  el.innerHTML = `<p class="muted">Generating summary…</p>`;
  try {
    const res = await fetch(`${API_BASE}/api/staff/summary`);
    const data = await res.json();
    el.innerHTML = data.summary ? renderMarkdown(data.summary) : (data.error || "No summary available.");
  } catch {
    el.innerHTML = `<p class="muted">Could not reach backend.</p>`;
  }
}
document.getElementById("refresh-summary").addEventListener("click", loadSummary);

async function loadQueryLog() {
  const list = document.getElementById("query-log");
  try {
    const res = await fetch(`${API_BASE}/api/staff/queries`);
    const data = await res.json();
    if (!data.queries || data.queries.length === 0) {
      list.innerHTML = `<li class="muted">Nothing logged yet.</li>`;
      return;
    }
    list.innerHTML = data.queries
      .slice()
      .reverse()
      .slice(0, 20)
      .map((q) => `<li><span class="q-lang">${q.language}</span>${escapeHtml(q.text)}</li>`)
      .join("");
  } catch {
    list.innerHTML = `<li class="muted">Could not reach backend.</li>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ===== Broadcast composer =====
document.getElementById("draft-broadcast-btn").addEventListener("click", async () => {
  const btn = document.getElementById("draft-broadcast-btn");
  const incident = document.getElementById("incident-input").value.trim();
  const output = document.getElementById("broadcast-output");
  if (!incident) return;

  const languages = Array.from(document.querySelectorAll(".lang-checks input:checked")).map((el) => el.value);
  btn.disabled = true;
  output.innerHTML = `<p class="muted">Drafting announcements…</p>`;

  try {
    const res = await fetch(`${API_BASE}/api/staff/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incident, languages }),
    });
    const data = await res.json();
    if (data.error) {
      output.innerHTML = `<p class="muted">${data.error}</p>`;
    } else {
      output.innerHTML = data.announcements
        .map((a) => `<div class="announcement-card"><span class="announcement-lang">${a.language}</span><div class="announcement-text">${escapeHtml(a.text)}</div></div>`)
        .join("");
    }
  } catch {
    output.innerHTML = `<p class="muted">Could not reach backend.</p>`;
  } finally {
    btn.disabled = false;
  }
});

// Initial load if staff tab is opened first via URL hash, etc.
if (document.getElementById("view-staff").classList.contains("active")) loadStaffData();
