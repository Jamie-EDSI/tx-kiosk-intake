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

const incomingCall     = document.querySelector("#incomingCall");
const incomingCallFrom = document.querySelector("#incomingCallFrom");
const answerCallButton = document.querySelector("#answerCall");
const declineCallButton = document.querySelector("#declineCall");
const activeCall        = document.querySelector("#activeCall");
const activeCallWith    = document.querySelector("#activeCallWith");
const kioskLocalVideo   = document.querySelector("#kioskLocalVideo");
const kioskRemoteVideo  = document.querySelector("#kioskRemoteVideo");
const hangupCallButton  = document.querySelector("#hangupCall");

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

let currentStep   = 0;
let deviceStream  = null;

let submittedRecordId = null; // the intake this kiosk session just created
let callSubscription  = null; // realtime subscription on call_requests, while on the confirmation screen
let kioskCallRow       = null; // the call_requests row currently ringing/active for this session
let kioskCallPC         = null;
let kioskCallStream     = null; // local camera/mic stream dedicated to the active call

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
  endKioskCall();
  callSubscription?.close();
  callSubscription = null;
  submittedRecordId = null;
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

// ── Incoming calls (WebRTC) ─────────────────────────────────────
// While on the confirmation screen, listen for a staff member calling
// the intake this session just submitted. Signaling rides on the
// call_requests table via Supabase Realtime — offer/answer SDP only,
// no ICE-candidate trickling (same-network demo, no TURN needed).

function parseDescription(value) {
  if (!value) return null;
  return typeof value === "string" ? JSON.parse(value) : value;
}

function waitForIceGatheringComplete(pc, timeoutMs = 3000) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

function subscribeToIncomingCalls() {
  callSubscription = SupabaseDB.realtime("call_requests", (eventType, row) => {
    if (!row || row.intake_id !== submittedRecordId) return;

    if (!kioskCallRow && eventType !== "DELETE" && row.status === "Ringing" && row.offer) {
      kioskCallRow = row;
      incomingCallFrom.textContent = `${row.staff_name} is calling you`;
      incomingCall.hidden = false;
    } else if (kioskCallRow && row.id === kioskCallRow.id) {
      if (row.status === "Ended" || row.status === "Declined") {
        endKioskCall();
      } else {
        kioskCallRow = row;
      }
    }
  });
}

answerCallButton.addEventListener("click", async () => {
  if (!kioskCallRow) return;
  incomingCall.hidden = true;

  try {
    // Reuse the already-tested camera/mic if the device check is running,
    // instead of prompting for permission and opening the camera twice.
    kioskCallStream = deviceStream ?? await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    deviceStream = null;
    devicePreview.srcObject = null;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    kioskCallStream.getTracks().forEach((track) => pc.addTrack(track, kioskCallStream));
    pc.addEventListener("track", (event) => {
      kioskRemoteVideo.srcObject = event.streams[0];
    });
    kioskCallPC = pc;

    await pc.setRemoteDescription(parseDescription(kioskCallRow.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGatheringComplete(pc);

    const updated = await SupabaseDB.update("call_requests", kioskCallRow.id, {
      answer: pc.localDescription.toJSON(),
      status: "Active"
    });
    kioskCallRow = updated;

    activeCallWith.textContent = updated.staff_name;
    kioskLocalVideo.srcObject = kioskCallStream;
    activeCall.hidden = false;
    deviceCheck.hidden = true;
    startAnother.hidden = true;
  } catch (err) {
    console.error("Answering call failed:", err);
    alert("Couldn't connect the call. Please try again or ask a staff member for help.");
    endKioskCall();
  }
});

declineCallButton.addEventListener("click", async () => {
  if (!kioskCallRow) return;
  const id = kioskCallRow.id;
  incomingCall.hidden = true;
  kioskCallRow = null;

  try {
    await SupabaseDB.update("call_requests", id, { status: "Declined", ended_at: new Date().toISOString() });
  } catch (err) {
    console.error("Decline failed:", err);
  }
});

hangupCallButton.addEventListener("click", async () => {
  const id = kioskCallRow?.id;
  endKioskCall();

  if (id) {
    try {
      await SupabaseDB.update("call_requests", id, { status: "Ended", ended_at: new Date().toISOString() });
    } catch (err) {
      console.error("Hangup failed:", err);
    }
  }
});

function endKioskCall() {
  kioskCallStream?.getTracks().forEach((track) => track.stop());
  kioskCallPC?.close();
  kioskCallPC = null;
  kioskCallStream = null;
  kioskCallRow = null;

  kioskLocalVideo.srcObject = null;
  kioskRemoteVideo.srcObject = null;
  incomingCall.hidden = true;
  activeCall.hidden = true;
  deviceCheck.hidden = false;
  startAnother.hidden = false;

  // Resets the device-check panel's visuals (its own stream is already gone)
  stopDeviceStream();
}

window.addEventListener("pagehide", () => {
  stopDeviceStream();
  if (kioskCallRow) {
    SupabaseDB.update("call_requests", kioskCallRow.id, { status: "Ended", ended_at: new Date().toISOString() }).catch(() => {});
  }
  endKioskCall();
});

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
    const saved = await IntakeData.saveRecord(record);

    // Show confirmation screen
    steps.forEach((step) => { step.hidden = true; });
    kioskActions.hidden = true;
    confirmation.hidden = false;

    // Clear idle timer — don't reset while showing confirmation
    clearTimeout(idleTimer);

    // Listen for a staff member calling this specific intake
    submittedRecordId = saved.id;
    subscribeToIncomingCalls();

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
