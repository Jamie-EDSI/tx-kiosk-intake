// ============================================================
// app.js — Admin queue  (updated for Supabase / async IntakeData)
//
// Changes from the localStorage version:
//   - init() loads records with await on page load
//   - persistRecords() → individual async save/update/delete calls
//   - subscribeToChanges() keeps the queue live across devices
//   - Everything else (render, escapeHtml, etc.) is unchanged
// ============================================================

const form          = document.querySelector("#intakeForm");
const queueList     = document.querySelector("#queueList");
const saveStatus    = document.querySelector("#saveStatus");
const resetDemo     = document.querySelector("#resetDemo");
const advanceStatus = document.querySelector("#advanceStatus");
const removeIntake  = document.querySelector("#removeIntake");

let records    = [];
let selectedId = null;

// ── Status helpers ────────────────────────────────────────────

function setStatus(text) {
  saveStatus.textContent = text;
}

function flashStatus(text, delay = 1400) {
  setStatus(text);
  window.setTimeout(() => setStatus("Ready"), delay);
}

// ── Render ────────────────────────────────────────────────────

function render() {
  renderMetrics();
  renderQueue();
  renderDetails();
}

function renderMetrics() {
  document.querySelector("#metricOpen").textContent =
    records.filter((r) => r.status !== "Complete").length;
  document.querySelector("#metricUrgent").textContent =
    records.filter((r) => r.priority === "Urgent").length;
  const average = Math.round(
    records.reduce((sum, r) => sum + r.minutes, 0) / Math.max(records.length, 1)
  );
  document.querySelector("#metricAvg").textContent = `${average}m`;
}

function renderQueue() {
  queueList.innerHTML = "";

  records.forEach((record) => {
    const button = document.createElement("button");
    button.className = `queue-card${record.id === selectedId ? " is-active" : ""}`;
    button.type = "button";
    button.setAttribute("role", "listitem");
    button.innerHTML = `
      <strong>${escapeHtml(record.name)}</strong>
      <p>${escapeHtml(record.type)}</p>
      <div class="card-meta">
        <span class="tag ${record.priority.toLowerCase()}">${escapeHtml(record.priority)}</span>
        <span class="tag">${escapeHtml(record.status)}</span>
      </div>
    `;
    button.addEventListener("click", () => {
      selectedId = record.id;
      render();
    });
    queueList.append(button);
  });
}

function renderDetails() {
  const record   = records.find((r) => r.id === selectedId);
  const hasRecord = Boolean(record);

  document.querySelector("#detailName").textContent      = record?.name      ?? "No intake selected";
  document.querySelector("#detailEmail").textContent     = record?.email     ?? "-";
  document.querySelector("#detailType").textContent      = record?.type      ?? "-";
  document.querySelector("#detailStatus").textContent    = record?.status    ?? "-";
  document.querySelector("#detailMaterials").textContent =
    record?.materials?.length ? record.materials.join(", ") : "-";
  document.querySelector("#detailNotes").textContent     =
    record?.notes ?? "Choose a queue item or add a new intake.";

  const priorityPill = document.querySelector("#detailPriority");
  priorityPill.textContent = record?.priority ?? "-";
  priorityPill.className   = `priority-pill ${record?.priority?.toLowerCase() ?? ""}`;

  advanceStatus.disabled = !hasRecord;
  removeIntake.disabled  = !hasRecord;
}

// ── Actions ───────────────────────────────────────────────────

async function advanceSelectedStatus() {
  const record = records.find((r) => r.id === selectedId);
  if (!record) return;

  const nextIndex = (IntakeData.statusFlow.indexOf(record.status) + 1) % IntakeData.statusFlow.length;
  const nextStatus = IntakeData.statusFlow[nextIndex];

  setStatus("Saving…");
  try {
    const updated = await IntakeData.updateRecord(record.id, { status: nextStatus });
    // Merge the update into the local array so the UI responds instantly
    const idx = records.findIndex((r) => r.id === updated.id);
    if (idx !== -1) records[idx] = updated;
    flashStatus("Saved");
    render();
  } catch (err) {
    flashStatus("Save failed — check connection");
    console.error(err);
  }
}

async function archiveSelected() {
  if (!selectedId) return;

  setStatus("Archiving…");
  try {
    await IntakeData.deleteRecord(selectedId);
    records    = records.filter((r) => r.id !== selectedId);
    selectedId = records[0]?.id ?? null;
    flashStatus("Archived");
    render();
  } catch (err) {
    flashStatus("Archive failed — check connection");
    console.error(err);
  }
}

// ── Utility ───────────────────────────────────────────────────

function escapeHtml(value) {
  return String(value)
    .replaceAll("&",  "&amp;")
    .replaceAll("<",  "&lt;")
    .replaceAll(">",  "&gt;")
    .replaceAll('"',  "&quot;")
    .replaceAll("'",  "&#039;");
}

// ── Realtime subscription ─────────────────────────────────────
// When a kiosk on a different device submits an intake, the
// admin queue updates automatically without a page refresh.

function subscribeToLiveUpdates() {
  IntakeData.subscribeToChanges((eventType, record) => {
    if (eventType === "INSERT") {
      // New intake arrived — prepend it
      records = [record, ...records];
      // Auto-select if nothing is selected
      if (!selectedId) selectedId = record.id;
      render();
    } else if (eventType === "UPDATE") {
      const idx = records.findIndex((r) => r.id === record.id);
      if (idx !== -1) records[idx] = record;
      render();
    } else if (eventType === "DELETE") {
      records = records.filter((r) => r.id !== record?.id);
      if (selectedId === record?.id) selectedId = records[0]?.id ?? null;
      render();
    }
  });
}

// ── Event listeners ───────────────────────────────────────────

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const record = IntakeData.createRecord(new FormData(form), "Admin");

  setStatus("Saving…");
  try {
    const saved = await IntakeData.saveRecord(record);
    records    = [saved, ...records];
    selectedId = saved.id;
    form.reset();
    flashStatus("Saved");
    render();
  } catch (err) {
    flashStatus("Save failed — check connection");
    console.error(err);
  }
});

advanceStatus.addEventListener("click", advanceSelectedStatus);
removeIntake.addEventListener("click",  archiveSelected);

resetDemo.addEventListener("click", async () => {
  // "Reset" in demo mode just reloads from the DB
  setStatus("Reloading…");
  try {
    records    = await IntakeData.loadRecords();
    selectedId = records[0]?.id ?? null;
    flashStatus("Reloaded");
    render();
  } catch (err) {
    flashStatus("Reload failed");
    console.error(err);
  }
});

// ── Boot ──────────────────────────────────────────────────────

async function init() {
  setStatus("Loading…");
  try {
    records    = await IntakeData.loadRecords();
    selectedId = records[0]?.id ?? null;
    render();
    setStatus("Ready");
    subscribeToLiveUpdates();
  } catch (err) {
    setStatus("Connection error");
    console.error("Could not load intakes from Supabase:", err);
  }
}

init();
