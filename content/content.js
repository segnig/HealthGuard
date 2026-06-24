/* global chrome */

// ── JOB 1: AUDIO MONITORING (safe hybrid) ──────────────────────────────────
//
// Routing a media element through the Web Audio API gives a precise RMS-based
// dB reading, but for CORS-cross-origin media the routed node outputs SILENCE,
// which would mute the site. So we only route media we can prove is safe
// (same-origin, or blob:/data:/MediaStream — this covers MSE players like
// YouTube). Genuinely cross-origin media is never routed; instead we estimate
// loudness from its volume and cap it by lowering volume (never muting).

const DEFAULT_MAX_DB = 85;
const MEASURE_INTERVAL_MS = 250; // ~4 readings/second.
const VOLUME_REF_DB = 90;        // Assumed SPL when a player is at volume 1.0.
const REPORT_THRESHOLD_DB = 30;  // Ignore near-silence.
const DOSE_CAP_DB = 70;          // Ceiling once the daily hearing dose hits 100%.

const ctx = new AudioContext();
const analyser = ctx.createAnalyser();
analyser.fftSize = 256;

const gain = ctx.createGain();
analyser.connect(gain);
gain.connect(ctx.destination);

const timeDomainData = new Uint8Array(analyser.fftSize);

/** Cross-origin media measured/capped via the volume proxy. @type {Set<HTMLMediaElement>} */
const proxyElements = new Set();

let routedCount = 0;
let lastMeasureTime = performance.now();
let lastDosePercent = 0;
let countdownTimer = null;
let audioUnlockBound = false;

window._hg_settings = { maxDB: DEFAULT_MAX_DB };

chrome.runtime.sendMessage({ type: "GET_SETTINGS" })
  .then((settings) => {
    if (settings && typeof settings.maxDB === "number") {
      window._hg_settings.maxDB = settings.maxDB;
    }
  })
  .catch(() => {});

// Keep the volume ceiling live when it changes in the options page.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && typeof changes.settings?.newValue?.maxDB === "number") {
    window._hg_settings.maxDB = changes.settings.newValue.maxDB;
  }
});

/**
 * Chrome keeps AudioContext suspended until the user interacts with the page.
 * Without a running context, routed media is silent to the analyser and dose stays at 0.
 * @returns {Promise<boolean>}
 */
async function ensureAudioRunning() {
  if (ctx.state === "running") return true;
  try {
    await ctx.resume();
  } catch {
    return false;
  }
  return ctx.state === "running";
}

/**
 * Moves elements that were waiting for a running context onto the analyser graph.
 */
function promotePendingRoutes() {
  if (ctx.state !== "running") return;

  document.querySelectorAll("audio, video").forEach((node) => {
    if (!(node instanceof HTMLMediaElement) || !node._hg_pendingRoute || node._hg_routed) {
      return;
    }

    node._hg_pendingRoute = false;
    proxyElements.delete(node);
    node._hg_classified = false;
    classifyMediaElement(node);
  });
}

function bindAudioUnlock() {
  if (audioUnlockBound) return;
  audioUnlockBound = true;

  const unlock = () => {
    ensureAudioRunning()
      .then((ok) => {
        if (ok) promotePendingRoutes();
      })
      .catch(() => {});
  };

  document.addEventListener("pointerdown", unlock, { capture: true });
  document.addEventListener("keydown", unlock, { capture: true });
  document.addEventListener("touchstart", unlock, { capture: true, passive: true });
}

/**
 * Estimated SPL (dB) for a given player volume. Volume 1.0 → VOLUME_REF_DB.
 * @param {number} volume
 * @returns {number}
 */
function dbFromVolume(volume) {
  const v = Math.max(0, Math.min(1, volume));
  return v > 0 ? VOLUME_REF_DB + 20 * Math.log10(v) : 0;
}

/**
 * Volume that yields the given SPL estimate (inverse of dbFromVolume).
 * @param {number} db
 * @returns {number}
 */
function volumeFromDb(db) {
  return Math.max(0, Math.min(1, Math.pow(10, (db - VOLUME_REF_DB) / 20)));
}

/**
 * Whether a media element can be routed through Web Audio without muting it.
 * @param {HTMLMediaElement} el
 * @returns {boolean}
 */
function isSafeToRoute(el) {
  const src = el.currentSrc || el.src || "";
  if (!src) return false; // Unknown yet — re-checked once a source attaches.

  try {
    if (/^(blob:|data:|mediastream:)/i.test(src)) return true;
    return new URL(src, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

/**
 * Decides once per element whether to route it (precise) or proxy it (safe).
 * @param {HTMLMediaElement} el
 */
function classifyMediaElement(el) {
  if (el._hg_classified || !el.currentSrc) return;

  if (isSafeToRoute(el)) {
    if (ctx.state !== "running") {
      proxyElements.add(el);
      el._hg_classified = true;
      el._hg_pendingRoute = true;
      return;
    }

    try {
      const source = ctx.createMediaElementSource(el);
      source.connect(analyser);
      routedCount += 1;
      el._hg_routed = true;
      el._hg_classified = true;
      proxyElements.delete(el);
      return;
    } catch {
      // Already bound to another graph — fall back to the proxy.
    }
  }

  proxyElements.add(el);
  el._hg_classified = true;
}

/**
 * Begins observing an element so we can classify it as soon as a source loads.
 * @param {Element} el
 */
function hookMediaElement(el) {
  if (!(el instanceof HTMLMediaElement) || el._hg_hooked) return;
  el._hg_hooked = true;

  const decide = () => classifyMediaElement(el);
  const onPlayback = () => {
    ensureAudioRunning()
      .then((ok) => {
        if (ok) promotePendingRoutes();
        decide();
      })
      .catch(() => {
        decide();
      });
  };

  if (el.currentSrc) decide();
  el.addEventListener("loadedmetadata", decide);
  el.addEventListener("play", onPlayback);
  el.addEventListener("playing", onPlayback);
}

function startMediaObserver() {
  bindAudioUnlock();
  document.querySelectorAll("audio, video").forEach(hookMediaElement);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const element = /** @type {Element} */ (node);
        if (element.matches("audio, video")) {
          hookMediaElement(element);
        }

        element.querySelectorAll("audio, video").forEach(hookMediaElement);
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.body) {
  startMediaObserver();
} else {
  document.addEventListener("DOMContentLoaded", startMediaObserver, { once: true });
}

/**
 * Aggregate dB of all routed (same-origin) media via the analyser.
 * @returns {number}
 */
function measureRoutedDb() {
  if (routedCount === 0) return 0;

  analyser.getByteTimeDomainData(timeDomainData);

  let sumSquares = 0;
  for (let i = 0; i < timeDomainData.length; i += 1) {
    const sample = (timeDomainData[i] - 128) / 128;
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / timeDomainData.length);
  return rms > 0 ? 20 * Math.log10(rms) + 90 : 0;
}

/**
 * Loudest estimate across playing cross-origin elements; prunes detached ones.
 * @returns {number}
 */
function measureProxyDb() {
  let loudest = 0;
  const fallbackForRouted = ctx.state !== "running";
  const candidates = new Set(proxyElements);

  if (fallbackForRouted) {
    document.querySelectorAll("audio, video").forEach((node) => {
      if (node instanceof HTMLMediaElement && node._hg_routed) {
        candidates.add(node);
      }
    });
  }

  for (const el of candidates) {
    if (!el.isConnected) {
      proxyElements.delete(el);
      continue;
    }
    if (el.paused || el.muted || el.volume <= 0) continue;

    const db = dbFromVolume(el.volume);
    if (db > loudest) loudest = db;
  }

  return loudest;
}

function measureTick() {
  if (ctx.state !== "running" && (routedCount > 0 || proxyElements.size > 0)) {
    ensureAudioRunning()
      .then((ok) => {
        if (ok) promotePendingRoutes();
      })
      .catch(() => {});
  }

  const now = performance.now();
  const durationMs = now - lastMeasureTime;
  lastMeasureTime = now;

  const routedDb = measureRoutedDb();
  const proxyDb = measureProxyDb();
  let dB = Math.max(routedDb, proxyDb);

  // If routing is active but the analyser still reads silence, estimate from volume.
  if (dB <= REPORT_THRESHOLD_DB) {
    document.querySelectorAll("audio, video").forEach((node) => {
      if (!(node instanceof HTMLMediaElement)) return;
      if (node.paused || node.muted || node.volume <= 0) return;
      dB = Math.max(dB, dbFromVolume(node.volume));
    });
  }

  if (dB > REPORT_THRESHOLD_DB) {
    chrome.runtime.sendMessage({
      type: "SOUND_EXPOSURE",
      payload: { dB, durationMs }
    })
      .then((response) => {
        if (response && typeof response.dosePercent === "number") {
          lastDosePercent = response.dosePercent;
        }
      })
      .catch(() => {});
  }

  const baseMax = window._hg_settings?.maxDB ?? DEFAULT_MAX_DB;
  const effectiveMax = lastDosePercent >= 100 ? Math.min(baseMax, DOSE_CAP_DB) : baseMax;

  // Routed media: attenuate via the shared gain node.
  const capGain = routedDb > effectiveMax
    ? Math.pow(10, (effectiveMax - routedDb) / 20)
    : 1;
  gain.gain.setTargetAtTime(capGain, ctx.currentTime, 0.1);

  // Cross-origin media: lower its own volume to the ceiling (never mutes).
  const targetVolume = volumeFromDb(effectiveMax);
  for (const el of proxyElements) {
    if (!el.isConnected || el.paused || el.muted) continue;
    if (dbFromVolume(el.volume) > effectiveMax && el.volume > targetVolume) {
      el.volume = targetVolume;
    }
  }
}

if (document.body) {
  startMediaObserver();
} else {
  document.addEventListener("DOMContentLoaded", startMediaObserver, { once: true });
}

// setInterval (not requestAnimationFrame) so background tabs playing audio are
// still measured — rAF is throttled to ~0 Hz when a tab is hidden.
setInterval(measureTick, MEASURE_INTERVAL_MS);

// ── JOB 2: BREAK OVERLAY ───────────────────────────────────────────────────

const BREAK_COPY = {
  "20-20-20": {
    title: "Eye Break",
    body: "Look at something 20 feet away for 20 seconds."
  },
  posture: {
    title: "Posture Check",
    body: "Sit up straight, feet flat, monitor at eye level."
  },
  scheduled: {
    title: "Eye Break",
    body: "Look at something 20 feet away for 20 seconds."
  },
  manual: {
    title: "Take a Break",
    body: "Step away from the screen for a moment."
  },
  block: {
    title: "Time limit reached",
    body: "You have reached your screen time limit. Take a break before continuing."
  }
};

function removeOverlay() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  document.getElementById("hg-overlay")?.remove();
}

function startCountdown(sec) {
  const timerEl = document.getElementById("hg-timer");
  if (!timerEl) return;

  let remaining = Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : 20;
  timerEl.textContent = String(remaining);

  countdownTimer = window.setInterval(() => {
    remaining -= 1;
    timerEl.textContent = String(Math.max(remaining, 0));

    if (remaining <= 0) {
      removeOverlay();
    }
  }, 1000);
}

function showOverlay({ reason, durationSec } = {}) {
  removeOverlay();

  const copy = BREAK_COPY[reason] || {
    title: "Health Break",
    body: "Step away from the screen for a moment."
  };

  const overlay = document.createElement("div");
  overlay.id = "hg-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "Health break reminder");
  overlay.innerHTML = `
    <div class="hg-card">
      <h2>${copy.title}</h2>
      <p class="hg-instruction">${copy.body}</p>
      <div class="hg-timer" id="hg-timer">${durationSec ?? 20}</div>
      <button id="hg-skip">Skip this break</button>
    </div>
  `;

  overlay.querySelector("#hg-skip")?.addEventListener("click", () => {
    removeOverlay();
    chrome.runtime.sendMessage({ type: "DISMISS_BREAK" }).catch(() => {});
  });

  document.body.appendChild(overlay);
  startCountdown(durationSec ?? 20);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SHOW_BREAK") showOverlay(msg.payload);
  if (msg.type === "HIDE_BREAK") removeOverlay();
  if (msg.type === "SHOW_BLOCK") {
    showOverlay({ reason: "block", durationSec: msg.payload?.durationSec ?? 30 });
  }
});
