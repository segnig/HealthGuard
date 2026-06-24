import { getDosePercent } from "./audio-analyser.js";

/**
 * Computes a 0–100 daily digital-health score.
 *
 * Weighting (matches README "Daily health score" table):
 *   - 30  total screen time within the daily limit
 *   - 25  breaks taken vs. breaks expected for the time spent
 *   - 25  hearing dose below 80%
 *   - 20  no per-site limit exceeded
 *
 * @param {import('./storage.js').TodayRecord} today
 * @param {import('./storage.js').Settings} settings
 * @returns {number} Integer score in the inclusive range [0, 100].
 */
export function computeHealthScore(today, settings) {
  if (!today || !settings) return 0;

  let score = 0;

  // 30 — total screen time within the daily limit.
  const totalMs = Math.max(0, today.totalMs || 0);
  if (settings.dailyLimitMs > 0 && totalMs <= settings.dailyLimitMs) {
    score += 30;
  }

  // 25 — breaks taken relative to the number expected for the time on screen.
  const breakIntervalMs = Math.max(1, settings.breakIntervalMin || 20) * 60_000;
  const expectedBreaks = Math.floor(totalMs / breakIntervalMs);
  if (expectedBreaks <= 0) {
    score += 25; // No break was due yet, so credit it in full.
  } else {
    const ratio = Math.min(1, (today.breakCount || 0) / expectedBreaks);
    score += Math.round(25 * ratio);
  }

  // 25 — hearing dose still below the warning threshold.
  if (getDosePercent(today.soundDose || 0) < 80) {
    score += 25;
  }

  // 20 — no per-site limit exceeded.
  const siteLimits = settings.siteLimits || {};
  const siteTimes = today.siteTimes || {};
  const anyExceeded = Object.entries(siteLimits).some(
    ([domain, limitMs]) => (siteTimes[domain] || 0) >= limitMs
  );
  if (!anyExceeded) {
    score += 20;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Returns a short qualitative label and color for a health score.
 * @param {number} score
 * @returns {{ label: string, color: string }}
 */
export function scoreSeverity(score) {
  const safe = Number.isFinite(score) ? score : 0;
  if (safe >= 80) return { label: "Excellent", color: "#16A34A" };
  if (safe >= 60) return { label: "Good", color: "#65A30D" };
  if (safe >= 40) return { label: "Fair", color: "#D97706" };
  return { label: "Needs care", color: "#DC2626" };
}
