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

const devicePreview    = document.querySelector("#devicePreview");
const deviceStatus     = document.querySelector("#deviceStatus");
const deviceSelects    = document.querySelector("#deviceSelects");
const cameraSelect     = document.querySelector("#cameraSelect");
const microphoneSelect = document.querySelector("#microphoneSelect");
const testDevices      = document.querySelector("#testDevices");
const stopDevices      = document.querySelector("#stopDevices");

let currentStep   = 0;
let deviceStream  = null;

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
  stopDeviceStream();
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

// ── Device check ─────────────────────────────────────────────
// On the confirmation screen, let the participant confirm their camera
// and mic work before a staff member calls them. Opt-in (button press)
// rather than automatic, since this is a shared public-facing device.

function setDeviceStatus(text) {
  deviceStatus.textContent = text;
}

function deviceCheckErrorMessage(err) {
  switch (err.name) {
    case "NotAllowedError":
      return "Camera/microphone access was blocked. Allow access in your browser to test your devices.";
    case "NotFoundError":
      return "No camera or microphone was found on this device.";
    case "NotReadableError":
      return "Your camera or microphone is already in use by another app.";
    default:
      return "Couldn't access your camera or microphone. Ask a staff member for help.";
  }
}

function fillDeviceSelect(select, devices, label) {
  select.innerHTML = "";
  if (!devices.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = `No ${label.toLowerCase()} found`;
    select.append(option);
    return;
  }
  devices.forEach((device, index) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label || `${label} ${index + 1}`;
    select.append(option);
  });
}

async function populateDeviceOptions() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  fillDeviceSelect(cameraSelect, devices.filter((d) => d.kind === "videoinput"), "Camera");
  fillDeviceSelect(microphoneSelect, devices.filter((d) => d.kind === "audioinput"), "Microphone");

  const activeVideoId = deviceStream?.getVideoTracks()[0]?.getSettings().deviceId;
  const activeAudioId = deviceStream?.getAudioTracks()[0]?.getSettings().deviceId;
  if (activeVideoId) cameraSelect.value = activeVideoId;
  if (activeAudioId) microphoneSelect.value = activeAudioId;

  deviceSelects.hidden = false;
}

function selectedDeviceConstraints() {
  return {
    video: cameraSelect.value ? { deviceId: { exact: cameraSelect.value } } : true,
    audio: microphoneSelect.value ? { deviceId: { exact: microphoneSelect.value } } : true
  };
}

async function startDeviceCheck(constraints = { video: true, audio: true }) {
  if (!navigator.mediaDevices?.getUserMedia) {
    setDeviceStatus("Device check isn't supported in this browser.");
    return;
  }

  testDevices.disabled = true;
  setDeviceStatus("Requesting camera and microphone access…");

  try {
    stopDeviceStream();
    deviceStream = await navigator.mediaDevices.getUserMedia(constraints);
    devicePreview.srcObject = deviceStream;
    devicePreview.hidden = false;
    await populateDeviceOptions();
    setDeviceStatus("Camera and microphone are working.");
    stopDevices.hidden = false;
    resetDeviceIdleTimer();
  } catch (err) {
    console.error("Device check failed:", err);
    setDeviceStatus(deviceCheckErrorMessage(err));
  } finally {
    testDevices.disabled = false;
  }
}

function stopDeviceStream() {
  clearTimeout(deviceIdleTimer);
  deviceStream?.getTracks().forEach((track) => track.stop());
  deviceStream = null;
  devicePreview.srcObject = null;
  devicePreview.hidden = true;
  deviceSelects.hidden = true;
  stopDevices.hidden = true;
}

testDevices.addEventListener("click", () => startDeviceCheck());
stopDevices.addEventListener("click", () => {
  stopDeviceStream();
  setDeviceStatus("Preview stopped.");
});
cameraSelect.addEventListener("change", () => startDeviceCheck(selectedDeviceConstraints()));
microphoneSelect.addEventListener("change", () => startDeviceCheck(selectedDeviceConstraints()));

// Release the camera/mic after 30s of inactivity even while the
// confirmation screen is left open — a public kiosk shouldn't keep
// recording just because someone walked away.
let deviceIdleTimer;

function resetDeviceIdleTimer() {
  clearTimeout(deviceIdleTimer);
  if (!deviceStream) return;
  deviceIdleTimer = setTimeout(() => {
    stopDeviceStream();
    setDeviceStatus("Preview stopped after inactivity.");
  }, 30_000);
}

document.addEventListener("pointerdown", resetDeviceIdleTimer);
document.addEventListener("keydown",     resetDeviceIdleTimer);
window.addEventListener("pagehide", stopDeviceStream);

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
