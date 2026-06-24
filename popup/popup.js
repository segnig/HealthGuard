import { doseSeverity, getDosePercent } from "../utils/audio-analyser.js";
import { formatMs } from "../utils/time-utils.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @param {number} pct
 * @param {string} color
 */
function drawDoseGauge(canvas, pct, color) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const size = canvas.width;
  const center = size / 2;
  const radius = 46;
  const lineWidth = 10;
  const safePct = Math.min(100, Math.max(0, pct));

  ctx.clearRect(0, 0, size, size);
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";

  ctx.strokeStyle = "#e2e8f0";
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.stroke();

  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + (safePct / 100) * Math.PI * 2;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(center, center, radius, startAngle, endAngle);
  ctx.stroke();

  ctx.fillStyle = "#1e293b";
  ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${safePct}%`, center, center);
}

const [today, settings] = await Promise.all([
  chrome.runtime.sendMessage({ type: "GET_TODAY" }),
  chrome.runtime.sendMessage({ type: "GET_SETTINGS" })
]);

const masterToggle = document.getElementById("master-toggle");
masterToggle.checked = Boolean(settings.enabled);
masterToggle.addEventListener("change", () => {
  chrome.runtime.sendMessage({
    type: "SET_SETTINGS",
    payload: { settings: { enabled: masterToggle.checked } }
  });
});

document.getElementById("total-time").textContent = formatMs(today.totalMs || 0);

const siteBars = document.getElementById("site-bars");
siteBars.innerHTML = "";

const topSites = Object.entries(today.siteTimes || {})
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5);

for (const [domain, ms] of topSites) {
  const bar = document.createElement("div");
  bar.className = "site-bar";

  const row = document.createElement("div");
  row.className = "site-row";

  const domainEl = document.createElement("span");
  domainEl.className = "site-domain";
  domainEl.textContent = domain;

  const durationEl = document.createElement("span");
  durationEl.className = "site-duration";
  durationEl.textContent = formatMs(ms);

  row.append(domainEl, durationEl);

  const progress = document.createElement("progress");
  progress.className = "site-progress";
  progress.max = 100;
  progress.value = today.totalMs > 0 ? (ms / today.totalMs) * 100 : 0;

  bar.append(row, progress);
  siteBars.appendChild(bar);
}

const limitPct = Math.min(100, (today.totalMs / settings.dailyLimitMs) * 100);
document.getElementById("limit-bar").value = limitPct;

const remainingMs = settings.dailyLimitMs - today.totalMs;
document.getElementById("limit-label").textContent =
  remainingMs > 0 ? `${formatMs(remainingMs)} remaining` : "Limit reached";

const dosePct = getDosePercent(today.soundDose || 0);
const { label, color } = doseSeverity(dosePct);
drawDoseGauge(document.getElementById("dose-gauge"), dosePct, color);
document.getElementById("dose-label").textContent = label;

document.getElementById("btn-break").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "FORCE_BREAK" });
});

document.getElementById("btn-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
