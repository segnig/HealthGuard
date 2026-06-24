import { doseSeverity, getDosePercent } from "../utils/audio-analyser.js";
import { computeHealthScore, scoreSeverity } from "../utils/health-score.js";
import { formatMs } from "../utils/time-utils.js";

const SITE_COLORS = ["#1A56A0", "#2563EB", "#3B82F6", "#60A5FA"];

/**
 * @param {number} ms
 * @returns {string}
 */
function formatLimitHours(ms) {
  const hours = ms / 3_600_000;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

/**
 * @param {number} ms
 * @returns {string}
 */
function formatCountdown(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "Due now";
  const totalMinutes = Math.ceil(ms / 60_000);
  if (totalMinutes < 60) return `In ${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `In ${hours}h ${minutes}m` : `In ${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {number} pct
 * @param {string} color
 */
function drawDoseGauge(canvas, pct, color) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height - 8;
  const radius = 52;
  const lineWidth = 10;
  const safePct = Math.min(100, Math.max(0, pct));
  const startAngle = Math.PI;
  const endAngle = 2 * Math.PI;

  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";

  ctx.strokeStyle = "#e2e8f0";
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, startAngle, endAngle);
  ctx.stroke();

  if (safePct > 0) {
    const arcSpan = endAngle - startAngle;
    const fgEnd = startAngle + arcSpan * (safePct / 100);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, fgEnd);
    ctx.stroke();
  }

  ctx.fillStyle = "#1e293b";
  ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${safePct}%`, centerX, centerY - 14);
}

/**
 * @param {HTMLElement} container
 * @param {{ breakMs: number | null, hydrateMs: number | null }} reminders
 */
function renderReminders(container, reminders) {
  container.innerHTML = "";

  const items = [
    {
      icon: "👁",
      iconClass: "eye",
      title: "Eye break (20-20-20)",
      ms: reminders.breakMs,
      badge: reminders.breakMs != null && reminders.breakMs <= 10 * 60_000 ? "Soon" : "Scheduled",
      badgeClass: reminders.breakMs != null && reminders.breakMs <= 10 * 60_000 ? "soon" : "due"
    },
    {
      icon: "💧",
      iconClass: "hydrate",
      title: "Hydration reminder",
      ms: reminders.hydrateMs,
      badge: reminders.hydrateMs != null && reminders.hydrateMs <= 15 * 60_000 ? "Due" : "Scheduled",
      badgeClass: reminders.hydrateMs != null && reminders.hydrateMs <= 15 * 60_000 ? "due" : "soon"
    }
  ];

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "reminder-card";
    card.innerHTML = `
      <div class="reminder-icon ${item.iconClass}">${item.icon}</div>
      <div class="reminder-body">
        <p class="reminder-title">${item.title}</p>
        <p class="reminder-countdown">${formatCountdown(item.ms ?? 0)}</p>
      </div>
      <span class="reminder-badge ${item.badgeClass}">${item.badge}</span>
    `;
    container.appendChild(card);
  });
}

const [today, settings, reminders] = await Promise.all([
  chrome.runtime.sendMessage({ type: "GET_TODAY" }),
  chrome.runtime.sendMessage({ type: "GET_SETTINGS" }),
  chrome.runtime.sendMessage({ type: "GET_REMINDERS" })
]);

const masterToggle = document.getElementById("master-toggle");
const statusLabel = document.getElementById("status-label");

/**
 * Mirrors the service worker's active-hours logic so the popup can explain a
 * scheduled pause instead of silently showing zero activity.
 * @param {number} hour
 * @returns {string}
 */
function formatHour(hour) {
  const safe = ((Math.round(hour) % 24) + 24) % 24;
  const period = safe < 12 ? "AM" : "PM";
  const display = safe % 12 === 0 ? 12 : safe % 12;
  return `${display} ${period}`;
}

function withinActiveHours(now = new Date()) {
  const start = Number.isFinite(settings.scheduleStart) ? settings.scheduleStart : 0;
  const end = Number.isFinite(settings.scheduleEnd) ? settings.scheduleEnd : 24;
  if (start === end) return true;
  const hour = now.getHours();
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

function updateStatus(enabled) {
  let text;
  let paused;

  if (!enabled) {
    text = "Paused · not tracking";
    paused = true;
  } else if (!withinActiveHours()) {
    text = `Paused · active ${formatHour(settings.scheduleStart)}–${formatHour(settings.scheduleEnd)}`;
    paused = true;
  } else {
    text = "Active · protecting you";
    paused = false;
  }

  statusLabel.textContent = text;
  statusLabel.classList.toggle("paused", paused);
}

masterToggle.checked = Boolean(settings.enabled);
updateStatus(settings.enabled);

masterToggle.addEventListener("change", () => {
  const enabled = masterToggle.checked;
  updateStatus(enabled);
  chrome.runtime.sendMessage({
    type: "SET_SETTINGS",
    payload: { settings: { enabled } }
  });
});

const healthScore = computeHealthScore(today, settings);
const scoreMeta = scoreSeverity(healthScore);
const scoreEl = document.getElementById("health-score");
scoreEl.textContent = String(healthScore);
scoreEl.style.color = scoreMeta.color;
document.getElementById("score-detail").textContent =
  `${scoreMeta.label} · breaks, limits & hearing combined.`;
const scoreRing = document.querySelector(".score-ring");
scoreRing.style.setProperty("--score-color", scoreMeta.color);
scoreRing.style.setProperty("--score-pct", String(healthScore));

document.getElementById("total-time").textContent = formatMs(today.totalMs || 0);
document.getElementById("limit-caption").textContent =
  `of ${formatLimitHours(settings.dailyLimitMs)} daily limit`;

const limitPct = settings.dailyLimitMs > 0
  ? Math.min(100, Math.round((today.totalMs / settings.dailyLimitMs) * 100))
  : 0;
const remainingMs = Math.max(0, settings.dailyLimitMs - (today.totalMs || 0));

document.getElementById("limit-used").textContent = `${limitPct}% used`;
document.getElementById("limit-remaining").textContent = `${formatMs(remainingMs)} remaining`;

const limitBar = document.getElementById("limit-bar");
limitBar.value = limitPct;
limitBar.classList.toggle("warn", limitPct >= 80 && limitPct < 100);
limitBar.classList.toggle("danger", limitPct >= 100);

const siteBars = document.getElementById("site-bars");
siteBars.innerHTML = "";

const topSites = Object.entries(today.siteTimes || {})
  .sort((a, b) => b[1] - a[1])
  .slice(0, 4);

if (!topSites.length) {
  const empty = document.createElement("p");
  empty.className = "site-empty";
  empty.textContent = "No site activity yet today.";
  siteBars.appendChild(empty);
}

const maxSiteMs = topSites[0]?.[1] || 1;

topSites.forEach(([domain, ms], index) => {
  const bar = document.createElement("div");
  bar.className = "site-bar";

  const row = document.createElement("div");
  row.className = "site-row";
  row.innerHTML = `
    <span class="site-domain">${domain}</span>
    <span class="site-duration">${formatMs(ms)}</span>
  `;

  const track = document.createElement("div");
  track.className = "site-micro-bar";
  const fill = document.createElement("span");
  fill.style.width = `${Math.round((ms / maxSiteMs) * 100)}%`;
  fill.style.background = SITE_COLORS[index] || SITE_COLORS[SITE_COLORS.length - 1];
  track.appendChild(fill);

  bar.append(row, track);
  siteBars.appendChild(bar);
});

const doseGauge = document.getElementById("dose-gauge");
const dosePct = getDosePercent(today.soundDose || 0);
const { label, color } = doseSeverity(dosePct);
const budgetRemaining = Math.max(0, 100 - dosePct);

if (doseGauge) {
  drawDoseGauge(doseGauge, dosePct, color);
}

document.getElementById("dose-caption").textContent = `${dosePct}% of daily`;
document.getElementById("dose-label").textContent =
  `${label}. ${budgetRemaining}% hearing budget remains.`;

renderReminders(document.getElementById("reminders-list"), reminders || {});

document.getElementById("btn-break").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "FORCE_BREAK" });
});

document.getElementById("btn-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
