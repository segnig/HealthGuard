/**
 * HealthGuard hearing exposure math utilities.
 *
 * WHO-based dose model:
 *   dose_delta = (durationMs / 3,600,000) * 10^((dB - 85) / 10)
 *
 * This represents accumulated sound energy exposure relative to a reference
 * of 85 dB over 8 hours, where total dose reaches 1.0.
 */

/**
 * Adds exposure for a sound segment to the current cumulative dose.
 * @param {number} currentDose - Current accumulated dose.
 * @param {number} dB - Measured sound level in decibels.
 * @param {number} durationMs - Segment duration in milliseconds.
 * @returns {number} Updated cumulative dose.
 */
export function addExposure(currentDose, dB, durationMs) {
  const baseDose = Number.isFinite(currentDose) ? currentDose : 0;
  const safeDb = Number.isFinite(dB) ? dB : 0;
  const safeDurationMs = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;

  const doseDelta = (safeDurationMs / 3_600_000) * Math.pow(10, (safeDb - 85) / 10);
  return baseDose + doseDelta;
}

/**
 * Converts a normalized dose value to a rounded percentage.
 * @param {number} dose - Dose where 1.0 equals 100%.
 * @returns {number} Rounded percentage.
 */
export function getDosePercent(dose) {
  const safeDose = Number.isFinite(dose) ? dose : 0;
  return Math.round(safeDose * 100);
}

/**
 * Computes a linear gain multiplier that caps loudness at maxDB.
 * Returns 1.0 when currentDB is within limit, otherwise an attenuation
 * multiplier in [0, 1).
 * @param {number} currentDB - Current sound level in decibels.
 * @param {number} maxDB - Maximum allowed sound level in decibels.
 * @returns {number} Linear gain multiplier.
 */
export function safeVolumeGain(currentDB, maxDB) {
  const safeCurrent = Number.isFinite(currentDB) ? currentDB : 0;
  const safeMax = Number.isFinite(maxDB) ? maxDB : 0;

  if (safeCurrent <= safeMax) {
    return 1.0;
  }

  return Math.pow(10, (safeMax - safeCurrent) / 20);
}

/**
 * Returns severity label and color for a hearing dose percentage.
 * @param {number} pct - Dose percent.
 * @returns {{label: string, color: string}} Severity metadata.
 */
export function doseSeverity(pct) {
  const safePct = Number.isFinite(pct) ? pct : 0;

  if (safePct < 50) {
    return { label: "Safe", color: "#16A34A" };
  }
  if (safePct < 80) {
    return { label: "Moderate", color: "#D97706" };
  }
  if (safePct < 100) {
    return { label: "Warning", color: "#EA580C" };
  }
  return { label: "Exceeded", color: "#DC2626" };
}
