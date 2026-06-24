import { doseSeverity } from "../utils/audio-analyser.js";
import { Storage } from "../utils/storage.js";
import { formatMs, todayKey } from "../utils/time-utils.js";

const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");
let weeklyRendered = false;
let soundRendered = false;

/**
 * @param {string} tabName
 */
function activateTab(tabName) {
  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });

  tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tabName}`);
  });

  if (tabName === "weekly" && !weeklyRendered) {
    weeklyRendered = true;
    renderWeeklyChart().catch(() => {});
  }

  if (tabName === "sound" && !soundRendered) {
    soundRendered = true;
    renderSoundHistory().catch(() => {});
  }
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activateTab(button.dataset.tab || "settings");
  });
});

const REMINDER_DISABLED_MIN = 10_080;
const POSTURE_DEFAULT_MIN = 30;
const HYDRATE_DEFAULT_MIN = 60;

const saveStatus = document.getElementById("save-status");
let saveTimer = null;

/**
 * @param {number} hour
 * @returns {string}
 */
function hourToTimeValue(hour) {
  const safe = Math.max(0, Math.min(23, Number(hour) || 0));
  return `${String(safe).padStart(2, "0")}:00`;
}

/**
 * @param {string} value
 * @returns {number}
 */
function timeValueToHour(value) {
  const [hour] = value.split(":");
  return Number.parseInt(hour, 10) || 0;
}

/**
 * @param {number} minutes
 * @returns {boolean}
 */
function isReminderEnabled(minutes) {
  return minutes > 0 && minutes < REMINDER_DISABLED_MIN;
}

function flashGlobalSaved() {
  saveStatus.textContent = "Saving…";
  saveStatus.classList.add("pending");
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveStatus.textContent = "✓ All saved";
    saveStatus.classList.remove("pending");
  }, 500);
}

/**
 * @param {string} key
 * @param {unknown} value
 * @returns {Promise<void>}
 */
async function sendSetting(key, value) {
  await chrome.runtime.sendMessage({
    type: "SET_SETTINGS",
    payload: { settings: { [key]: value } }
  });
  flashGlobalSaved();
}

/**
 * @param {import('../utils/storage.js').Settings} settings
 */
function loadSettingsForm(settings) {
  document.getElementById("daily-limit-hours").value =
    String(settings.dailyLimitMs / 3_600_000);

  const breakInterval = document.getElementById("break-interval");
  breakInterval.value = String(settings.breakIntervalMin);
  document.getElementById("break-interval-value").textContent =
    `${settings.breakIntervalMin} min`;

  const breakDuration = document.getElementById("break-duration");
  breakDuration.value = String(settings.breakDurationSec);
  document.getElementById("break-duration-value").textContent =
    `${settings.breakDurationSec} sec`;

  document.getElementById("action-on-limit").value = settings.actionOnLimit;

  const maxDb = document.getElementById("max-db");
  maxDb.value = String(settings.maxDB);
  document.getElementById("max-db-value").textContent = `${settings.maxDB} dB`;

  const hearingWarn = document.getElementById("hearing-warn");
  hearingWarn.value = String(settings.hearingWarnAt);
  document.getElementById("hearing-warn-value").textContent =
    `${settings.hearingWarnAt}%`;

  document.getElementById("schedule-start").value =
    hourToTimeValue(settings.scheduleStart);
  document.getElementById("schedule-end").value =
    hourToTimeValue(settings.scheduleEnd);
  document.getElementById("blue-light-time").value =
    hourToTimeValue(settings.blueLightHour);

  document.getElementById("posture-enabled").checked =
    isReminderEnabled(settings.postureIntervalMin);
  document.getElementById("hydrate-enabled").checked =
    isReminderEnabled(settings.hydrateIntervalMin);
  document.getElementById("summary-enabled").checked =
    settings.summaryEnabled !== false;
  document.getElementById("auto-export").checked = Boolean(settings.autoExport);
}

function bindSettingsForm() {
  document.getElementById("daily-limit-hours").addEventListener("change", async (e) => {
    const hours = Number(/** @type {HTMLInputElement} */ (e.target).value);
    await sendSetting("dailyLimitMs", hours * 3_600_000);
  });

  document.getElementById("break-interval").addEventListener("input", async (e) => {
    const value = Number(/** @type {HTMLInputElement} */ (e.target).value);
    document.getElementById("break-interval-value").textContent = `${value} min`;
    await sendSetting("breakIntervalMin", value);
  });

  document.getElementById("break-duration").addEventListener("input", async (e) => {
    const value = Number(/** @type {HTMLInputElement} */ (e.target).value);
    document.getElementById("break-duration-value").textContent = `${value} sec`;
    await sendSetting("breakDurationSec", value);
  });

  document.getElementById("action-on-limit").addEventListener("change", async (e) => {
    await sendSetting("actionOnLimit", /** @type {HTMLSelectElement} */ (e.target).value);
  });

  document.getElementById("max-db").addEventListener("input", async (e) => {
    const value = Number(/** @type {HTMLInputElement} */ (e.target).value);
    document.getElementById("max-db-value").textContent = `${value} dB`;
    await sendSetting("maxDB", value);
  });

  document.getElementById("hearing-warn").addEventListener("input", async (e) => {
    const value = Number(/** @type {HTMLInputElement} */ (e.target).value);
    document.getElementById("hearing-warn-value").textContent = `${value}%`;
    await sendSetting("hearingWarnAt", value);
  });

  document.getElementById("schedule-start").addEventListener("change", async (e) => {
    await sendSetting("scheduleStart", timeValueToHour(/** @type {HTMLInputElement} */ (e.target).value));
  });

  document.getElementById("schedule-end").addEventListener("change", async (e) => {
    await sendSetting("scheduleEnd", timeValueToHour(/** @type {HTMLInputElement} */ (e.target).value));
  });

  document.getElementById("blue-light-time").addEventListener("change", async (e) => {
    await sendSetting("blueLightHour", timeValueToHour(/** @type {HTMLInputElement} */ (e.target).value));
  });

  document.getElementById("posture-enabled").addEventListener("change", async (e) => {
    const enabled = /** @type {HTMLInputElement} */ (e.target).checked;
    await sendSetting("postureIntervalMin", enabled ? POSTURE_DEFAULT_MIN : REMINDER_DISABLED_MIN);
  });

  document.getElementById("hydrate-enabled").addEventListener("change", async (e) => {
    const enabled = /** @type {HTMLInputElement} */ (e.target).checked;
    await sendSetting("hydrateIntervalMin", enabled ? HYDRATE_DEFAULT_MIN : REMINDER_DISABLED_MIN);
  });

  document.getElementById("summary-enabled").addEventListener("change", async (e) => {
    await sendSetting("summaryEnabled", /** @type {HTMLInputElement} */ (e.target).checked);
  });

  document.getElementById("auto-export").addEventListener("change", async (e) => {
    await sendSetting("autoExport", /** @type {HTMLInputElement} */ (e.target).checked);
  });
}

// ── Per-site limits ────────────────────────────────────────────────────────

/** @type {Record<string, number>} */
let siteLimits = {};

/**
 * Normalizes free-form domain input ("https://www.YouTube.com/feed") to a bare
 * host ("youtube.com").
 * @param {string} input
 * @returns {string|null}
 */
function normalizeDomain(input) {
  const value = (input || "").trim().toLowerCase();
  if (!value) return null;

  const host = value
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0];

  return host || null;
}

/**
 * @param {number} ms
 * @returns {string}
 */
function limitLabel(ms) {
  const hours = ms / 3_600_000;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

async function saveSiteLimits() {
  await chrome.runtime.sendMessage({
    type: "SET_SITE_LIMITS",
    payload: { siteLimits }
  });
  flashGlobalSaved();
}

function renderSiteLimits() {
  const list = document.getElementById("site-limit-list");
  list.innerHTML = "";

  const entries = Object.entries(siteLimits).sort((a, b) => a[0].localeCompare(b[0]));

  if (!entries.length) {
    const empty = document.createElement("li");
    empty.className = "site-limit-empty";
    empty.textContent = "No per-site limits yet.";
    list.appendChild(empty);
    return;
  }

  entries.forEach(([domain, ms]) => {
    const item = document.createElement("li");
    item.className = "site-limit-item";

    const label = document.createElement("span");
    label.className = "sl-domain";
    label.textContent = domain;

    const limit = document.createElement("span");
    limit.className = "sl-limit";
    limit.textContent = limitLabel(ms);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "sl-remove";
    remove.textContent = "Remove";
    remove.addEventListener("click", async () => {
      delete siteLimits[domain];
      renderSiteLimits();
      await saveSiteLimits();
    });

    item.append(label, limit, remove);
    list.appendChild(item);
  });
}

function bindSiteLimits() {
  const domainInput = document.getElementById("site-limit-domain");
  const hoursInput = document.getElementById("site-limit-hours");

  const addLimit = async () => {
    const domain = normalizeDomain(domainInput.value);
    const hours = Number(hoursInput.value);

    if (!domain || !Number.isFinite(hours) || hours <= 0) return;

    siteLimits[domain] = Math.round(hours * 3_600_000);
    domainInput.value = "";
    hoursInput.value = "";
    renderSiteLimits();
    await saveSiteLimits();
  };

  document.getElementById("site-limit-add").addEventListener("click", addLimit);
  domainInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addLimit();
  });
  hoursInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addLimit();
  });
}

/**
 * @param {string} dateStr
 * @returns {string}
 */
function shortDayLabel(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

/**
 * @param {import('../utils/storage.js').TodayRecord[]} logs
 * @returns {import('../utils/storage.js').TodayRecord[]}
 */
function chronologicalLogs(logs) {
  return [...logs].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {string} message
 */
function drawEmptyChartMessage(ctx, width, height, message) {
  ctx.fillStyle = "#64748b";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, width / 2, height / 2);
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {import('../utils/storage.js').TodayRecord[]} logs
 */
function drawWeeklyChart(canvas, logs) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const padding = { top: 24, right: 24, bottom: 48, left: 48 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  if (!logs.length) {
    drawEmptyChartMessage(ctx, width, height, "No weekly data yet");
    return;
  }

  const values = logs.map((log) => (log.totalMs || 0) / 3_600_000);
  const maxHours = Math.max(1, ...values, 0.25);
  const barGap = logs.length > 1 ? 16 : 0;
  const barWidth = (chartWidth - barGap * (logs.length - 1)) / logs.length;

  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  logs.forEach((log, index) => {
    const hours = (log.totalMs || 0) / 3_600_000;
    const barHeight = (hours / maxHours) * chartHeight;
    const x = padding.left + index * (barWidth + barGap);
    const y = padding.top + chartHeight - barHeight;

    ctx.fillStyle = "#2563eb";
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = "#64748b";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(shortDayLabel(log.date), x + barWidth / 2, height - 20);
  });

  ctx.fillStyle = "#475569";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i += 1) {
    const value = maxHours - (maxHours / 4) * i;
    const y = padding.top + (chartHeight / 4) * i + 4;
    ctx.fillText(`${value.toFixed(1)}h`, padding.left - 8, y);
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {import('../utils/storage.js').TodayRecord[]} logs
 */
function drawSoundChart(canvas, logs) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const padding = { top: 24, right: 24, bottom: 48, left: 48 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  if (!logs.length) {
    drawEmptyChartMessage(ctx, width, height, "No sound history yet");
    return;
  }

  const points = logs.map((log) => ({
    date: log.date,
    pct: Math.min(100, Math.round((log.soundDose || 0) * 100))
  }));

  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  const warningY = padding.top + chartHeight - (80 / 100) * chartHeight;
  ctx.strokeStyle = "#94a3b8";
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(padding.left, warningY);
  ctx.lineTo(width - padding.right, warningY);
  ctx.stroke();
  ctx.setLineDash([]);

  if (points.length > 1) {
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const current = points[i];
      const x1 = padding.left + ((i - 1) / (points.length - 1)) * chartWidth;
      const y1 = padding.top + chartHeight - (prev.pct / 100) * chartHeight;
      const x2 = padding.left + (i / (points.length - 1)) * chartWidth;
      const y2 = padding.top + chartHeight - (current.pct / 100) * chartHeight;

      ctx.strokeStyle = doseSeverity(current.pct).color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  } else if (points.length === 1) {
    const point = points[0];
    const x = padding.left + chartWidth / 2;
    const y = padding.top + chartHeight - (point.pct / 100) * chartHeight;
    ctx.fillStyle = doseSeverity(point.pct).color;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#64748b";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  const labelEvery = Math.max(1, Math.floor(points.length / 6));
  points.forEach((point, index) => {
    if (index % labelEvery !== 0 && index !== points.length - 1) return;
    const x = points.length === 1
      ? padding.left + chartWidth / 2
      : padding.left + (index / (points.length - 1)) * chartWidth;
    ctx.fillText(point.date.slice(5), x, height - 20);
  });

  ctx.textAlign = "right";
  ctx.fillStyle = "#475569";
  for (let i = 0; i <= 4; i += 1) {
    const value = 100 - (100 / 4) * i;
    const y = padding.top + (chartHeight / 4) * i + 4;
    ctx.fillText(`${value}%`, padding.left - 8, y);
  }
}

/**
 * @param {import('../utils/storage.js').TodayRecord[]} logs
 */
function renderHeatmap(logs) {
  const heatmap = document.getElementById("heatmap");
  heatmap.innerHTML = "";

  if (!logs.length) {
    heatmap.textContent = "No sound history yet";
    return;
  }

  chronologicalLogs(logs).forEach((log) => {
    const pct = Math.min(100, Math.round((log.soundDose || 0) * 100));
    const cell = document.createElement("div");
    cell.className = "heat-cell";
    cell.style.backgroundColor = doseSeverity(pct).color;
    cell.title = `${log.date}: ${pct}%`;
    heatmap.appendChild(cell);
  });
}

async function renderWeeklyChart() {
  const logs = chronologicalLogs(await Storage.getLogs(7));
  drawWeeklyChart(document.getElementById("chart-weekly"), logs);
}

async function renderSoundHistory() {
  const logs = chronologicalLogs(await Storage.getLogs(30));
  drawSoundChart(document.getElementById("chart-sound"), logs);
  renderHeatmap(logs);
}

/**
 * @param {string} filename
 * @param {string} content
 * @param {string} mimeType
 */
function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const settings = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
loadSettingsForm(settings);
bindSettingsForm();

siteLimits = { ...(settings.siteLimits || {}) };
renderSiteLimits();
bindSiteLimits();

document.getElementById("btn-export-json").addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "EXPORT_DATA" });
  downloadTextFile(`healthguard-${todayKey()}.json`, response.data, "application/json");
});

document.getElementById("btn-export-csv").addEventListener("click", async () => {
  const csv = await Storage.exportCSV();
  downloadTextFile(`healthguard-${todayKey()}.csv`, csv, "text/csv");
});

document.getElementById("btn-reset").addEventListener("click", async () => {
  if (!window.confirm("Reset all of today's HealthGuard data?")) return;
  await chrome.runtime.sendMessage({ type: "RESET_TODAY" });
});
