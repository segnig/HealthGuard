/**
 * Returns today's date key in YYYY-MM-DD format.
 * @returns {string}
 */
export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Formats milliseconds into a short, human-readable duration string.
 * - Under 60,000 ms: "Xs"
 * - Under 3,600,000 ms: "Xm"
 * - 3,600,000+ ms: "Xh Ym" (omits minutes when zero)
 * @param {number} ms
 * @returns {string}
 */
export function formatMs(ms) {
  const safeMs = Number.isFinite(ms) ? Math.max(0, ms) : 0;

  if (safeMs < 60_000) {
    return `${Math.floor(safeMs / 1000)}s`;
  }

  if (safeMs < 3_600_000) {
    return `${Math.floor(safeMs / 60_000)}m`;
  }

  const hours = Math.floor(safeMs / 3_600_000);
  const minutes = Math.floor((safeMs % 3_600_000) / 60_000);
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/**
 * Returns the timestamp (ms) of the next occurrence of a given local time.
 * If the time today has passed, returns the same time tomorrow.
 * @param {number} hour
 * @param {number} minute
 * @returns {number}
 */
export function nextOccurrenceOf(hour, minute) {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);

  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  return target.getTime();
}

/**
 * Extracts a normalized domain hostname from a URL.
 * Removes a leading "www." when present.
 * Returns null for invalid URL strings.
 * @param {string} url
 * @returns {string|null}
 */
export function domainOf(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}
