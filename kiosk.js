// ============================================================
// kiosk.js — Walk-up kiosk  (updated for Supabase / async IntakeData)
//
// Changes from the localStorage version:
//   - form submit now awaits IntakeData.saveRecord()
//   - idle reset timer added (90s of inactivity → reset form)
//   - Everything else (step nav, validation) is unchanged
// ============================================================

const kioskForm    = document.querySelector("#kioskForm");
const steps        = [...document.querySelectorAll(".kiosk-step")];
const progressItems = [...document.querySelectorAll(".step-indicator span")];
const backStep     = document.querySelector("#backStep");
const nextStep     = document.querySelector("#nextStep");
const submitKiosk  = document.querySelector("#submitKiosk");
const kioskActions = document.querySelector("#kioskActions");
const confirmation = document.querySelector("#kioskConfirmation");
const startAnother = document.querySelector("#startAnother");

let currentStep = 0;

// ── Step navigation ───────────────────────────────────────────

function showStep(index) {
  currentStep = index;

  steps.forEach((step, i) => step.classList.toggle("is-active", i === currentStep));
  progressItems.forEach((item, i) => item.classList.toggle("is-active", i <= currentStep));

  backStep.disabled    = currentStep === 0;
  nextStep.hidden      = currentStep === steps.length - 1;
  submitKiosk.hidden   = currentStep !== steps.length - 1;
}

function validateCurrentStep() {
  const fields = [...steps[currentStep].querySelectorAll("input, textarea, select")];
  return fields.every((field) => field.reportValidity());
}

function resetKiosk() {
  kioskForm.reset();
  confirmation.hidden = true;
  kioskActions.hidden = false;
  steps.forEach((step) => { step.hidden = false; });
  showStep(0);
  document.querySelector("#kioskName")?.focus();
  resetIdleTimer();
}

// ── Idle reset ────────────────────────────────────────────────
// If someone walks away mid-form, the next person gets a clean slate.
// 90 seconds of no interaction → automatic reset.

let idleTimer;

function resetIdleTimer() {
  clearTimeout(idleTimer);
  // Don't run the timer on the confirmation screen — let it sit
  if (!confirmation.hidden) return;
  idleTimer = setTimeout(() => {
    resetKiosk();
  }, 90_000); // 90 seconds
}

// Track any touch or key interaction
document.addEventListener("pointerdown", resetIdleTimer);
document.addEventListener("keydown",     resetIdleTimer);

// ── Event listeners ───────────────────────────────────────────

backStep.addEventListener("click", () => {
  showStep(Math.max(currentStep - 1, 0));
});

nextStep.addEventListener("click", () => {
  if (!validateCurrentStep()) return;
  showStep(Math.min(currentStep + 1, steps.length - 1));
});

kioskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateCurrentStep()) return;

  // Disable submit button while saving so double-taps don't double-submit
  submitKiosk.disabled = true;
  submitKiosk.textContent = "Submitting…";

  const record = IntakeData.createRecord(new FormData(kioskForm), "Kiosk");

  try {
    await IntakeData.saveRecord(record);

    // Show confirmation screen
    steps.forEach((step) => { step.hidden = true; });
    kioskActions.hidden = true;
    confirmation.hidden = false;

    // Clear idle timer — don't reset while showing confirmation
    clearTimeout(idleTimer);

  } catch (err) {
    // Surface a plain-English error — the participant should try again
    // or ask a staff member for help.
    console.error("Intake save failed:", err);
    alert("Something went wrong submitting your request. Please let a staff member know.");
    submitKiosk.disabled = false;
    submitKiosk.textContent = "Submit intake";
  }
});

startAnother.addEventListener("click", resetKiosk);

// ── Boot ──────────────────────────────────────────────────────

showStep(0);
resetIdleTimer();
