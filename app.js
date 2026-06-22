const STORAGE_KEY = "intake-demo-records";

const seedTemplates = [
  {
    name: "Avery Morgan",
    email: "avery.morgan@example.com",
    type: "New application",
    priority: "Urgent",
    status: "Needs review",
    minutes: 8,
    notes: "Submitted a new application with a same-week deadline. Verify ID and route to eligibility review.",
    materials: ["ID received", "Consent signed"]
  },
  {
    name: "Sam Patel",
    email: "sam.patel@example.com",
    type: "Document collection",
    priority: "High",
    status: "Waiting on docs",
    minutes: 14,
    notes: "Missing proof upload. Follow up by email and keep the case in document collection.",
    materials: ["Consent signed"]
  },
  {
    name: "Casey Rivera",
    email: "casey.rivera@example.com",
    type: "Case update",
    priority: "Standard",
    status: "Assigned",
    minutes: 22,
    notes: "Asked for a status update after a recent phone call. Confirm assignment and add the note to the case file.",
    materials: ["ID received", "Consent signed", "Proof uploaded"]
  }
];

const statusFlow = ["Needs review", "Waiting on docs", "Assigned", "Complete"];
const form = document.querySelector("#intakeForm");
const queueList = document.querySelector("#queueList");
const saveStatus = document.querySelector("#saveStatus");
const resetDemo = document.querySelector("#resetDemo");
const advanceStatus = document.querySelector("#advanceStatus");
const removeIntake = document.querySelector("#removeIntake");

let records = loadRecords();
let selectedId = records[0]?.id ?? null;

function loadRecords() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return createSeedRecords();
  }

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.length ? parsed : createSeedRecords();
  } catch {
    return createSeedRecords();
  }
}

function createSeedRecords() {
  return seedTemplates.map((record) => ({
    ...record,
    id: crypto.randomUUID(),
    materials: [...record.materials]
  }));
}

function persistRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  saveStatus.textContent = "Saved";
  window.setTimeout(() => {
    saveStatus.textContent = "Ready";
  }, 1200);
}

function render() {
  renderMetrics();
  renderQueue();
  renderDetails();
}

function renderMetrics() {
  document.querySelector("#metricOpen").textContent = records.filter((record) => record.status !== "Complete").length;
  document.querySelector("#metricUrgent").textContent = records.filter((record) => record.priority === "Urgent").length;
  const average = Math.round(records.reduce((sum, record) => sum + record.minutes, 0) / Math.max(records.length, 1));
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
  const record = records.find((item) => item.id === selectedId);
  const hasRecord = Boolean(record);

  document.querySelector("#detailName").textContent = record?.name ?? "No intake selected";
  document.querySelector("#detailEmail").textContent = record?.email ?? "-";
  document.querySelector("#detailType").textContent = record?.type ?? "-";
  document.querySelector("#detailStatus").textContent = record?.status ?? "-";
  document.querySelector("#detailMaterials").textContent = record?.materials?.length ? record.materials.join(", ") : "-";
  document.querySelector("#detailNotes").textContent = record?.notes ?? "Choose a queue item or add a new intake.";

  const priorityPill = document.querySelector("#detailPriority");
  priorityPill.textContent = record?.priority ?? "-";
  priorityPill.className = `priority-pill ${record?.priority?.toLowerCase() ?? ""}`;

  advanceStatus.disabled = !hasRecord;
  removeIntake.disabled = !hasRecord;
}

function createRecord(formData) {
  const materials = formData.getAll("materials");
  return {
    id: crypto.randomUUID(),
    name: formData.get("clientName").trim(),
    email: formData.get("email").trim(),
    type: formData.get("requestType"),
    priority: formData.get("priority"),
    status: "Needs review",
    minutes: Math.floor(Math.random() * 14) + 6,
    notes: formData.get("notes").trim(),
    materials
  };
}

function advanceSelectedStatus() {
  const record = records.find((item) => item.id === selectedId);
  if (!record) {
    return;
  }

  const currentIndex = statusFlow.indexOf(record.status);
  record.status = statusFlow[(currentIndex + 1) % statusFlow.length];
  persistRecords();
  render();
}

function archiveSelected() {
  records = records.filter((record) => record.id !== selectedId);
  selectedId = records[0]?.id ?? null;
  persistRecords();
  render();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const record = createRecord(new FormData(form));
  records = [record, ...records];
  selectedId = record.id;
  form.reset();
  persistRecords();
  render();
});

advanceStatus.addEventListener("click", advanceSelectedStatus);
removeIntake.addEventListener("click", archiveSelected);
resetDemo.addEventListener("click", () => {
  records = createSeedRecords();
  selectedId = records[0].id;
  persistRecords();
  render();
});

render();
