const steps = document.querySelectorAll(".step");
const progressDots = document.querySelectorAll(".progress-dot");
const prevBtn = document.getElementById("btn-prev");
const nextBtn = document.getElementById("btn-next");
const summaryList = document.getElementById("summary-list");

let currentStep = 1;

/** @type {Record<string, unknown>} */
const wizardSettings = {
  dailyLimitHours: 4,
  breakIntervalMin: 20,
  maxDB: 85,
  hearingWarnAt: 80,
  scheduleStart: "09:00",
  scheduleEnd: "18:00",
  postureEnabled: true,
  hydrateEnabled: true
};

/**
 * @param {string} timeValue
 * @returns {number}
 */
function hourFromTimeInput(timeValue) {
  const [hour] = timeValue.split(":");
  return Number.parseInt(hour, 10) || 0;
}

function collectCurrentStepValues() {
  if (currentStep === 2) {
    wizardSettings.dailyLimitHours = Number(document.getElementById("daily-limit-hours").value);
    wizardSettings.breakIntervalMin = Number(document.getElementById("break-interval-min").value);
  }

  if (currentStep === 3) {
    wizardSettings.maxDB = Number(document.getElementById("max-db").value);
    wizardSettings.hearingWarnAt = Number(document.getElementById("hearing-warn-at").value);
  }

  if (currentStep === 4) {
    wizardSettings.scheduleStart = document.getElementById("schedule-start").value;
    wizardSettings.scheduleEnd = document.getElementById("schedule-end").value;
    wizardSettings.postureEnabled = document.getElementById("posture-enabled").checked;
    wizardSettings.hydrateEnabled = document.getElementById("hydrate-enabled").checked;
  }
}

function buildSummary() {
  const postureText = wizardSettings.postureEnabled ? "On" : "Off";
  const hydrateText = wizardSettings.hydrateEnabled ? "On" : "Off";

  summaryList.innerHTML = `
    <li>Daily screen limit: ${wizardSettings.dailyLimitHours} hours</li>
    <li>Break interval: ${wizardSettings.breakIntervalMin} minutes</li>
    <li>Max sound level: ${wizardSettings.maxDB} dB</li>
    <li>Hearing warning at: ${wizardSettings.hearingWarnAt}%</li>
    <li>Active hours: ${wizardSettings.scheduleStart} to ${wizardSettings.scheduleEnd}</li>
    <li>Posture reminders: ${postureText}</li>
    <li>Hydration reminders: ${hydrateText}</li>
  `;
}

/**
 * @param {number} stepNumber
 */
function showStep(stepNumber) {
  currentStep = stepNumber;

  steps.forEach((step) => {
    const isActive = Number(step.dataset.step) === stepNumber;
    step.style.display = isActive ? "block" : "none";
    step.classList.toggle("active", isActive);
  });

  progressDots.forEach((dot) => {
    const dotStep = Number(dot.dataset.step);
    dot.classList.toggle("active", dotStep === stepNumber);
    dot.classList.toggle("complete", dotStep < stepNumber);
  });

  prevBtn.disabled = stepNumber === 1;
  nextBtn.textContent = stepNumber === 5 ? "Start protecting my health" : "Next";

  if (stepNumber === 5) {
    collectCurrentStepValues();
    buildSummary();
  }
}

async function finishWizard() {
  collectCurrentStepValues();

  const settings = {
    enabled: true,
    dailyLimitMs: wizardSettings.dailyLimitHours * 3_600_000,
    breakIntervalMin: wizardSettings.breakIntervalMin,
    maxDB: wizardSettings.maxDB,
    hearingWarnAt: wizardSettings.hearingWarnAt,
    scheduleStart: hourFromTimeInput(wizardSettings.scheduleStart),
    scheduleEnd: hourFromTimeInput(wizardSettings.scheduleEnd),
    postureIntervalMin: wizardSettings.postureEnabled ? 30 : 10_080,
    hydrateIntervalMin: wizardSettings.hydrateEnabled ? 60 : 10_080
  };

  await chrome.runtime.sendMessage({
    type: "SET_SETTINGS",
    payload: { settings }
  });

  await chrome.storage.local.set({ onboardingCompleted: true });
  window.close();
}

function bindRangeDisplay(rangeId, valueId, suffix) {
  const range = document.getElementById(rangeId);
  const valueEl = document.getElementById(valueId);

  const update = () => {
    valueEl.textContent = `${range.value}${suffix}`;
  };

  range.addEventListener("input", update);
  update();
}

bindRangeDisplay("max-db", "max-db-value", " dB");
bindRangeDisplay("hearing-warn-at", "hearing-warn-at-value", "%");
bindRangeDisplay("break-interval-min", "break-interval-value", " min");

prevBtn.addEventListener("click", () => {
  if (currentStep > 1) {
    showStep(currentStep - 1);
  }
});

nextBtn.addEventListener("click", async () => {
  collectCurrentStepValues();

  if (currentStep < 5) {
    showStep(currentStep + 1);
    return;
  }

  await finishWizard();
});

showStep(1);
