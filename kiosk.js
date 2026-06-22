const kioskForm = document.querySelector("#kioskForm");
const steps = [...document.querySelectorAll(".kiosk-step")];
const progressItems = [...document.querySelectorAll(".step-indicator span")];
const backStep = document.querySelector("#backStep");
const nextStep = document.querySelector("#nextStep");
const submitKiosk = document.querySelector("#submitKiosk");
const kioskActions = document.querySelector("#kioskActions");
const confirmation = document.querySelector("#kioskConfirmation");
const startAnother = document.querySelector("#startAnother");

let currentStep = 0;

function showStep(index) {
  currentStep = index;

  steps.forEach((step, stepIndex) => {
    step.classList.toggle("is-active", stepIndex === currentStep);
  });

  progressItems.forEach((item, itemIndex) => {
    item.classList.toggle("is-active", itemIndex <= currentStep);
  });

  backStep.disabled = currentStep === 0;
  nextStep.hidden = currentStep === steps.length - 1;
  submitKiosk.hidden = currentStep !== steps.length - 1;
}

function validateCurrentStep() {
  const fields = [...steps[currentStep].querySelectorAll("input, textarea, select")];
  return fields.every((field) => field.reportValidity());
}

function resetKiosk() {
  kioskForm.reset();
  confirmation.hidden = true;
  kioskActions.hidden = false;
  steps.forEach((step) => {
    step.hidden = false;
  });
  showStep(0);
  document.querySelector("#kioskName").focus();
}

backStep.addEventListener("click", () => {
  showStep(Math.max(currentStep - 1, 0));
});

nextStep.addEventListener("click", () => {
  if (!validateCurrentStep()) {
    return;
  }

  showStep(Math.min(currentStep + 1, steps.length - 1));
});

kioskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!validateCurrentStep()) {
    return;
  }

  const records = IntakeData.loadRecords();
  const record = IntakeData.createRecord(new FormData(kioskForm), "Kiosk");
  IntakeData.saveRecords([record, ...records]);

  steps.forEach((step) => {
    step.hidden = true;
  });
  kioskActions.hidden = true;
  confirmation.hidden = false;
});

startAnother.addEventListener("click", resetKiosk);

showStep(0);
