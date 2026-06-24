/* global chrome */

// ── JOB 1: AUDIO MONITORING ────────────────────────────────────────────────

const ctx = new AudioContext();
const analyser = ctx.createAnalyser();
analyser.fftSize = 256;

const gain = ctx.createGain();
analyser.connect(gain);
gain.connect(ctx.destination);

const timeDomainData = new Uint8Array(analyser.fftSize);
let lastMeasureTime = performance.now();
let countdownTimer = null;

function hookMediaElement(el) {
  if (el._hg_hooked) return;

  el._hg_hooked = true;

  try {
    const src = ctx.createMediaElementSource(el);
    src.connect(analyser);
  } catch {
    // Element may already be routed through another AudioContext.
  }
}

function startMediaObserver() {
  document.querySelectorAll("audio, video").forEach(hookMediaElement);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const element = /** @type {Element} */ (node);
        if (element.matches("audio, video")) {
          hookMediaElement(/** @type {HTMLMediaElement} */ (element));
        }

        element.querySelectorAll("audio, video").forEach(hookMediaElement);
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

if (ctx.state === "suspended") {
  const resume = () => {
    ctx.resume().catch(() => {});
  };

  document.addEventListener("click", resume, { once: true });
  document.addEventListener("keydown", resume, { once: true });
}

function measureLoop() {
  const now = performance.now();
  const durationMs = now - lastMeasureTime;
  lastMeasureTime = now;

  analyser.getByteTimeDomainData(timeDomainData);

  let sumSquares = 0;
  for (let i = 0; i < timeDomainData.length; i += 1) {
    const sample = (timeDomainData[i] - 128) / 128;
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / timeDomainData.length);
  const dB = rms > 0 ? 20 * Math.log10(rms) + 90 : 0;

  if (dB > 30) {
    chrome.runtime.sendMessage({
      type: "SOUND_EXPOSURE",
      payload: { dB, durationMs }
    }).catch(() => {});
  }

  const maxDB = window._hg_settings?.maxDB ?? 85;
  const capGain = dB > maxDB ? Math.pow(10, (maxDB - dB) / 20) : 1;
  gain.gain.setTargetAtTime(capGain, ctx.currentTime, 0.1);

  requestAnimationFrame(measureLoop);
}

if (document.body) {
  startMediaObserver();
} else {
  document.addEventListener("DOMContentLoaded", startMediaObserver, { once: true });
}

requestAnimationFrame(measureLoop);

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
  manual: {
    title: "Take a Break",
    body: "Step away from the screen for a moment."
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
});
