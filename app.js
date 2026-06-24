const STORAGE_KEY = "workforce-intake-visits";

const seedVisits = [
  {
    id: "V-1001",
    createdAt: minutesAgo(42),
    firstName: "Maya",
    lastName: "Rivera",
    dob: "1992-04-18",
    last4: "4812",
    phone: "(555) 018-7712",
    reason: "Orientation",
    appointmentTime: "09:30",
    language: "Spanish",
    needs: ["Interpreter", "Training program"],
    notes: "First visit. Asked about CDL training eligibility.",
    status: "Waiting",
    staffNotes: ""
  },
  {
    id: "V-1002",
    createdAt: minutesAgo(28),
    firstName: "Andre",
    lastName: "Coleman",
    dob: "1986-11-02",
    last4: "9920",
    phone: "(555) 013-4408",
    reason: "Job search",
    appointmentTime: "",
    language: "English",
    needs: ["Computer access", "Resume help"],
    notes: "Needs help uploading resume to employer portal.",
    status: "In service",
    staffNotes: "Assigned to resource room."
  },
  {
    id: "V-1003",
    createdAt: minutesAgo(11),
    firstName: "Nadia",
    lastName: "Hassan",
    dob: "1999-07-09",
    last4: "2055",
    phone: "(555) 017-9022",
    reason: "Document drop-off",
    appointmentTime: "10:15",
    language: "Arabic",
    needs: ["Accessibility support"],
    notes: "Dropping off proof of residency.",
    status: "Waiting",
    staffNotes: ""
  }
];

let visits = loadVisits();
let selectedVisitId = visits.find((visit) => visit.status !== "Completed")?.id || visits[0]?.id || null;

const views = {
  kiosk: document.querySelector("#kiosk-view"),
  staff: document.querySelector("#staff-view"),
  settings: document.querySelector("#settings-view")
};

const intakeForm = document.querySelector("#intake-form");
const queueSearch = document.querySelector("#queue-search");
const statusFilter = document.querySelector("#status-filter");
const queueList = document.querySelector("#queue-list");
const participantDetail = document.querySelector("#participant-detail");
const detailEmpty = document.querySelector("#detail-empty");
const miniQueue = document.querySelector("#mini-queue");
const toast = document.querySelector("#toast");

document.querySelectorAll(".nav-tab").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

document.querySelectorAll(".language-switch .segmented").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".language-switch .segmented").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    showToast(`${button.textContent.trim()} selected for testing.`);
  });
});

intakeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(intakeForm);
  const visit = {
    id: nextVisitId(),
    createdAt: new Date().toISOString(),
    firstName: formData.get("firstName").trim(),
    lastName: formData.get("lastName").trim(),
    dob: formData.get("dob"),
    last4: formData.get("last4"),
    phone: formData.get("phone").trim(),
    reason: formData.get("reason"),
    appointmentTime: formData.get("appointmentTime"),
    language: formData.get("language"),
    needs: formData.getAll("needs"),
    notes: formData.get("notes").trim(),
    status: "Waiting",
    staffNotes: ""
  };

  visits = [visit, ...visits];
  selectedVisitId = visit.id;
  saveVisits();
  intakeForm.reset();
  render();
  showToast(`${visit.firstName} ${visit.lastName} is checked in.`);
});

queueSearch.addEventListener("input", renderQueue);
statusFilter.addEventListener("change", renderQueue);

document.querySelector("#export-json").addEventListener("click", () => {
  const json = JSON.stringify(visits, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `workforce-intake-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Queue exported as JSON.");
});

document.querySelector("#clear-queue").addEventListener("click", () => {
  visits = [];
  selectedVisitId = null;
  saveVisits();
  render();
  showToast("Test queue cleared.");
});

document.querySelectorAll(".scenario").forEach((button) => {
  button.addEventListener("click", () => {
    const scenario = createScenario(button.dataset.scenario);
    visits = [scenario, ...visits];
    selectedVisitId = scenario.id;
    saveVisits();
    render();
    switchView("staff");
    showToast(`${scenario.firstName} ${scenario.lastName} added to the queue.`);
  });
});

function switchView(name) {
  Object.entries(views).forEach(([viewName, node]) => node.classList.toggle("active", viewName === name));
  document.querySelectorAll(".nav-tab").forEach((button) => {
    const active = button.dataset.view === name;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function loadVisits() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : seedVisits;
  } catch {
    return seedVisits;
  }
}

function saveVisits() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(visits));
}

function render() {
  renderMetrics();
  renderMiniQueue();
  renderQueue();
  renderDetail();
}

function renderMetrics() {
  const today = new Date().toDateString();
  const todaysVisits = visits.filter((visit) => new Date(visit.createdAt).toDateString() === today);
  const waitingVisits = visits.filter((visit) => visit.status === "Waiting");
  const waitTimes = waitingVisits.map((visit) => waitMinutes(visit.createdAt));
  const avg = waitTimes.length ? Math.round(waitTimes.reduce((sum, value) => sum + value, 0) / waitTimes.length) : 0;

  document.querySelector("#today-count").textContent = `${todaysVisits.length} ${todaysVisits.length === 1 ? "visit" : "visits"}`;
  document.querySelector("#waiting-count").textContent = waitingVisits.length;
  document.querySelector("#avg-wait").textContent = `Average wait: ${avg} min`;
}

function renderMiniQueue() {
  const waiting = visits.filter((visit) => visit.status === "Waiting").slice(0, 5);
  miniQueue.innerHTML = waiting.length
    ? waiting.map((visit) => `
        <li>
          <strong>${escapeHtml(fullName(visit))}</strong>
          <span>${escapeHtml(visit.reason)} · ${waitMinutes(visit.createdAt)} min</span>
        </li>
      `).join("")
    : `<li><strong>No one waiting</strong><span>New check-ins appear here.</span></li>`;
}

function renderQueue() {
  const term = queueSearch.value.trim().toLowerCase();
  const status = statusFilter.value;
  const filtered = visits.filter((visit) => {
    const searchable = [fullName(visit), visit.id, visit.reason, visit.language, visit.needs.join(" ")].join(" ").toLowerCase();
    return (status === "all" || visit.status === status) && (!term || searchable.includes(term));
  });

  queueList.innerHTML = filtered.length
    ? filtered.map((visit) => `
        <button class="queue-item ${visit.id === selectedVisitId ? "active" : ""}" type="button" data-id="${visit.id}">
          <span class="queue-row">
            <strong>${escapeHtml(fullName(visit))}</strong>
            ${statusBadge(visit.status)}
          </span>
          <span class="queue-meta">${escapeHtml(visit.reason)} · ${escapeHtml(visit.id)} · ${waitMinutes(visit.createdAt)} min wait</span>
        </button>
      `).join("")
    : `<div class="empty-state"><strong>No matching visits</strong><span>Try changing the search or status filter.</span></div>`;

  queueList.querySelectorAll(".queue-item").forEach((item) => {
    item.addEventListener("click", () => {
      selectedVisitId = item.dataset.id;
      renderQueue();
      renderDetail();
    });
  });
}

function renderDetail() {
  const visit = visits.find((item) => item.id === selectedVisitId);
  detailEmpty.hidden = Boolean(visit);
  participantDetail.hidden = !visit;
  if (!visit) {
    participantDetail.innerHTML = "";
    return;
  }

  participantDetail.innerHTML = `
    <div class="detail-header">
      <div>
        <h2>${escapeHtml(fullName(visit))}</h2>
        <div class="detail-meta">${escapeHtml(visit.id)} · DOB ${formatDate(visit.dob)} · ID ending ${escapeHtml(visit.last4)}</div>
      </div>
      ${statusBadge(visit.status)}
    </div>

    <div class="detail-section">
      <strong>Visit</strong>
      <span>${escapeHtml(visit.reason)}${visit.appointmentTime ? ` · Appointment ${formatTime(visit.appointmentTime)}` : ""}</span>
      <span>Checked in ${waitMinutes(visit.createdAt)} minutes ago</span>
    </div>

    <div class="detail-section">
      <strong>Contact and language</strong>
      <span>${escapeHtml(visit.phone || "No phone provided")} · ${escapeHtml(visit.language)}</span>
    </div>

    <div class="detail-section">
      <strong>Needs</strong>
      <div class="tag-list">
        ${visit.needs.length ? visit.needs.map((need) => `<span class="tag">${escapeHtml(need)}</span>`).join("") : `<span class="tag">None selected</span>`}
      </div>
    </div>

    <div class="detail-section">
      <strong>Participant notes</strong>
      <span>${escapeHtml(visit.notes || "No notes provided.")}</span>
    </div>

    <label class="detail-section">
      Staff notes
      <textarea id="staff-notes" rows="4">${escapeHtml(visit.staffNotes || "")}</textarea>
    </label>

    <div class="status-actions">
      <button class="button secondary" type="button" data-status="Waiting">Mark waiting</button>
      <button class="button secondary" type="button" data-status="In service">Start service</button>
      <button class="button primary" type="button" data-status="Completed">Complete</button>
    </div>
  `;

  participantDetail.querySelector("#staff-notes").addEventListener("input", (event) => {
    visit.staffNotes = event.target.value;
    saveVisits();
  });

  participantDetail.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", () => {
      visit.status = button.dataset.status;
      saveVisits();
      render();
      showToast(`${fullName(visit)} marked ${visit.status.toLowerCase()}.`);
    });
  });
}

function statusBadge(status) {
  const className = status.toLowerCase().replace(" ", "-");
  return `<span class="badge ${className}">${escapeHtml(status)}</span>`;
}

function createScenario(type) {
  const scenarios = {
    orientation: {
      firstName: "Elena",
      lastName: "Morales",
      dob: "1994-03-21",
      last4: "3371",
      phone: "(555) 014-6198",
      reason: "Orientation",
      appointmentTime: "11:00",
      language: "Spanish",
      needs: ["Interpreter", "Training program"],
      notes: "Interested in healthcare pathway orientation."
    },
    job: {
      firstName: "Marcus",
      lastName: "Bennett",
      dob: "1988-08-14",
      last4: "7064",
      phone: "(555) 016-8832",
      reason: "Job search",
      appointmentTime: "",
      language: "English",
      needs: ["Computer access", "Resume help"],
      notes: "Returning participant; needs help applying for warehouse roles."
    },
    documents: {
      firstName: "Priya",
      lastName: "Shah",
      dob: "1997-12-03",
      last4: "5410",
      phone: "(555) 012-4490",
      reason: "Document drop-off",
      appointmentTime: "",
      language: "English",
      needs: [],
      notes: "Dropping off training program eligibility documents."
    }
  };

  return {
    id: nextVisitId(),
    createdAt: new Date().toISOString(),
    status: "Waiting",
    staffNotes: "",
    ...scenarios[type]
  };
}

function nextVisitId() {
  const max = visits.reduce((highest, visit) => {
    const number = Number(String(visit.id).replace(/\D/g, ""));
    return Number.isFinite(number) ? Math.max(highest, number) : highest;
  }, 1000);
  return `V-${max + 1}`;
}

function fullName(visit) {
  return `${visit.firstName} ${visit.lastName}`;
}

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function waitMinutes(timestamp) {
  return Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 60000));
}

function formatDate(value) {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function formatTime(value) {
  if (!value) return "";
  const [hour, minute] = value.split(":").map(Number);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(2026, 0, 1, hour, minute));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2400);
}

render();
