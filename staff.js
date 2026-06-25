// ============================================================
// staff.js — Staff console
//
// Identity: pick a name from the fixed roster below, remembered in
// localStorage for this device. No auth — same no-login posture as
// the rest of the app. Edit STAFF_ROSTER to match your team.
//
// Talks to two new Supabase tables (see supabase-staff-migration.sql):
//   staff_presence  — one row per staff member, Available/Busy/Offline
//   call_requests   — a staff member calling a specific intake
// via the shared SupabaseDB client exported from data.js.
// ============================================================

const STAFF_ROSTER = ["Jordan Avery", "Riley Chen", "Morgan Diaz", "Taylor Brooks"];
const IDENTITY_KEY = "intake-app-staff-name";

const identitySelect  = document.querySelector("#staffSelect");
const presenceButtons = [...document.querySelectorAll(".presence-btn")];
const rosterList      = document.querySelector("#rosterList");
const queueList       = document.querySelector("#staffQueueList");
const callsList       = document.querySelector("#callsList");
const staffStatus     = document.querySelector("#staffStatus");

let staffName    = localStorage.getItem(IDENTITY_KEY) ?? "";
let presenceRows = [];
let queueRecords = [];
let callRows     = [];

// ── Status helpers ──────────────────────────────────────────────

function setStatus(text) {
  staffStatus.textContent = text;
}

function flashStatus(text, delay = 1400) {
  setStatus(text);
  window.setTimeout(() => setStatus("Ready"), delay);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ── Identity ──────────────────────────────────────────────────

function populateIdentitySelect() {
  identitySelect.innerHTML =
    `<option value="">Who are you?</option>` +
    STAFF_ROSTER.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  identitySelect.value = staffName;
}

identitySelect.addEventListener("change", () => {
  staffName = identitySelect.value;
  localStorage.setItem(IDENTITY_KEY, staffName);
  renderPresenceButtons();
  renderRoster();
});

// ── Presence ──────────────────────────────────────────────────

function myPresenceStatus() {
  return presenceRows.find((row) => row.name === staffName)?.status ?? "Offline";
}

function renderPresenceButtons() {
  const current = myPresenceStatus();
  presenceButtons.forEach((button) => {
    button.classList.toggle("is-active", Boolean(staffName) && button.dataset.status === current);
    button.disabled = !staffName;
  });
}

function renderRoster() {
  rosterList.innerHTML = "";
  STAFF_ROSTER.forEach((name) => {
    const status = presenceRows.find((row) => row.name === name)?.status ?? "Offline";
    const row = document.createElement("div");
    row.className = "roster-row";
    row.innerHTML = `
      <span>${escapeHtml(name)}${name === staffName ? " (you)" : ""}</span>
      <span class="tag presence-${status.toLowerCase()}">${escapeHtml(status)}</span>
    `;
    rosterList.append(row);
  });
}

async function setMyPresence(status) {
  if (!staffName) return;

  setStatus("Saving…");
  try {
    const row = await SupabaseDB.upsert("staff_presence", {
      name: staffName,
      status,
      updated_at: new Date().toISOString()
    });
    const idx = presenceRows.findIndex((r) => r.name === row.name);
    if (idx === -1) presenceRows.push(row); else presenceRows[idx] = row;
    flashStatus("Saved");
    renderPresenceButtons();
    renderRoster();
  } catch (err) {
    flashStatus("Save failed — check connection");
    console.error(err);
  }
}

presenceButtons.forEach((button) => {
  button.addEventListener("click", () => setMyPresence(button.dataset.status));
});

// ── Queue ───────────────────────────────────────────────────────

function renderQueue() {
  const open = queueRecords.filter((record) => record.status !== "Complete");
  queueList.innerHTML = "";

  if (!open.length) {
    queueList.innerHTML = `<p class="empty-state">No open intakes.</p>`;
    return;
  }

  open.forEach((record) => {
    const card = document.createElement("div");
    card.className = "queue-card";
    card.innerHTML = `
      <strong>${escapeHtml(record.name)}</strong>
      <p>${escapeHtml(record.type)}</p>
      <div class="card-meta">
        <span class="tag ${record.priority.toLowerCase()}">${escapeHtml(record.priority)}</span>
        <span class="tag">${escapeHtml(record.status)}</span>
      </div>
      <button class="secondary-button" type="button">Call</button>
    `;
    card.querySelector("button").addEventListener("click", () => startCall(record));
    queueList.append(card);
  });
}

async function startCall(record) {
  if (!staffName) {
    flashStatus("Pick your name first");
    return;
  }

  setStatus("Calling…");
  try {
    const row = await SupabaseDB.insert("call_requests", {
      intake_id: record.id,
      intake_name: record.name,
      staff_name: staffName,
      status: "Ringing",
      created_at: new Date().toISOString()
    });
    callRows = [row, ...callRows];
    flashStatus("Ringing");
    renderCalls();
  } catch (err) {
    flashStatus("Call failed — check connection");
    console.error(err);
  }
}

// ── Active calls ──────────────────────────────────────────────

function renderCalls() {
  const active = callRows.filter((row) => row.status === "Ringing" || row.status === "Active");
  callsList.innerHTML = "";

  if (!active.length) {
    callsList.innerHTML = `<p class="empty-state">No active calls.</p>`;
    return;
  }

  active.forEach((row) => {
    const elapsed = Math.max(0, Math.round((Date.now() - new Date(row.created_at).getTime()) / 1000));
    const card = document.createElement("div");
    card.className = "call-card";
    card.innerHTML = `
      <strong>${escapeHtml(row.intake_name)}</strong>
      <p>${escapeHtml(row.staff_name)} · ${escapeHtml(row.status)} · ${elapsed}s</p>
      <div class="card-meta">
        ${row.status === "Ringing" ? `<button class="secondary-button" data-action="connect" type="button">Mark connected</button>` : ""}
        <button class="ghost-button danger" data-action="end" type="button">End call</button>
      </div>
    `;
    card.querySelector("[data-action='connect']")?.addEventListener("click", () => updateCall(row.id, { status: "Active" }));
    card.querySelector("[data-action='end']").addEventListener("click", () => updateCall(row.id, { status: "Ended", ended_at: new Date().toISOString() }));
    callsList.append(card);
  });
}

async function updateCall(id, patch) {
  setStatus("Saving…");
  try {
    const row = await SupabaseDB.update("call_requests", id, patch);
    const idx = callRows.findIndex((r) => r.id === row.id);
    if (idx !== -1) callRows[idx] = row;
    flashStatus("Saved");
    renderCalls();
  } catch (err) {
    flashStatus("Save failed — check connection");
    console.error(err);
  }
}

// ── Realtime subscriptions ──────────────────────────────────────

function subscribeToPresence() {
  SupabaseDB.realtime("staff_presence", (eventType, row) => {
    if (!row) return;
    if (eventType === "DELETE") {
      presenceRows = presenceRows.filter((r) => r.name !== row.name);
    } else {
      const idx = presenceRows.findIndex((r) => r.name === row.name);
      if (idx === -1) presenceRows.push(row); else presenceRows[idx] = row;
    }
    renderPresenceButtons();
    renderRoster();
  });
}

function subscribeToCalls() {
  SupabaseDB.realtime("call_requests", (eventType, row) => {
    if (!row) return;
    if (eventType === "DELETE") {
      callRows = callRows.filter((r) => r.id !== row.id);
    } else {
      const idx = callRows.findIndex((r) => r.id === row.id);
      if (idx === -1) callRows.push(row); else callRows[idx] = row;
    }
    renderCalls();
  });
}

function subscribeToQueue() {
  IntakeData.subscribeToChanges((eventType, record) => {
    if (eventType === "INSERT") {
      queueRecords = [record, ...queueRecords];
    } else if (eventType === "UPDATE") {
      const idx = queueRecords.findIndex((r) => r.id === record.id);
      if (idx !== -1) queueRecords[idx] = record;
    } else if (eventType === "DELETE") {
      queueRecords = queueRecords.filter((r) => r.id !== record?.id);
    }
    renderQueue();
  });
}

// ── Boot ──────────────────────────────────────────────────────

async function init() {
  populateIdentitySelect();
  renderPresenceButtons();
  renderRoster();

  setStatus("Loading…");
  try {
    const [presence, calls, records] = await Promise.all([
      SupabaseDB.select("staff_presence"),
      SupabaseDB.select("call_requests", { status: "in.(Ringing,Active)" }),
      IntakeData.loadRecords()
    ]);
    presenceRows = presence;
    callRows     = calls;
    queueRecords = records;

    renderPresenceButtons();
    renderRoster();
    renderQueue();
    renderCalls();
    setStatus("Ready");

    subscribeToPresence();
    subscribeToCalls();
    subscribeToQueue();

    // Keep the "ringing for Xs" counters moving even without new DB events
    window.setInterval(renderCalls, 5000);
  } catch (err) {
    setStatus("Connection error");
    console.error("Could not load staff console data:", err);
  }
}

init();
