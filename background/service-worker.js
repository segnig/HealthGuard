import { Storage } from "../utils/storage.js";
import * as AudioAnalyser from "../utils/audio-analyser.js";
import {
  domainOf as extractDomain,
  formatMs,
  nextOccurrenceOf,
  todayKey
} from "../utils/time-utils.js";

const ALARM_FLUSH = "hg_flush";
const ALARM_BREAK = "hg_break";
const ALARM_POSTURE = "hg_posture";
const ALARM_HYDRATE = "hg_hydrate";
const ALARM_SUMMARY = "hg_summary";

/** @type {Record<string, { startTime: number | null, accumulatedMs: number }>} */
let sessionMap = {};

/** @type {number | null} */
let activeTabId = null;

/** @type {string | null} */
let activeDomain = null;

/** @type {boolean} */
let isIdle = false;

/**
 * Extracts a normalized domain from a tab URL.
 * @param {string | undefined} url
 * @returns {string | null}
 */
function domainOf(url) {
  return url ? extractDomain(url) : null;
}

/**
 * Ensures a session entry exists and starts timing for the given domain.
 * @param {string} domain
 */
function startTimer(domain) {
  if (!domain || isIdle) return;

  if (!sessionMap[domain]) {
    sessionMap[domain] = { startTime: null, accumulatedMs: 0 };
  }

  sessionMap[domain].startTime = Date.now();
}

/**
 * Flushes elapsed time for the active domain into storage.
 * @returns {Promise<void>}
 */
async function pauseCurrent() {
  if (!activeDomain) return;

  const session = sessionMap[activeDomain];
  if (!session?.startTime) return;

  const elapsed = Date.now() - session.startTime;
  session.accumulatedMs += elapsed;
  session.startTime = null;

  await Storage.addTime(activeDomain, elapsed);
}

/**
 * Creates or refreshes all recurring HealthGuard alarms.
 * @returns {Promise<void>}
 */
async function ensureAlarms() {
  const settings = await Storage.getSettings();

  await chrome.alarms.create(ALARM_FLUSH, { periodInMinutes: 0.5 });
  await chrome.alarms.create(ALARM_BREAK, { periodInMinutes: settings.breakIntervalMin });
  await chrome.alarms.create(ALARM_POSTURE, { periodInMinutes: settings.postureIntervalMin });
  await chrome.alarms.create(ALARM_HYDRATE, { periodInMinutes: settings.hydrateIntervalMin });
  if (settings.summaryEnabled !== false) {
    await chrome.alarms.create(ALARM_SUMMARY, {
      when: nextOccurrenceOf(21, 0),
      periodInMinutes: 24 * 60
    });
  } else {
    await chrome.alarms.clear(ALARM_SUMMARY);
  }
}

/**
 * Flushes the active session and restarts timing when appropriate.
 * @returns {Promise<void>}
 */
async function flushSessionToStorage() {
  const domain = activeDomain;
  await pauseCurrent();

  if (domain && !isIdle) {
    startTimer(domain);
  }
}

/**
 * Sends a basic extension notification.
 * @param {string} title
 * @param {string} message
 * @returns {Promise<void>}
 */
async function sendNotification(title, message) {
  await chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon48.png",
    title,
    message
  });
}

/**
 * Sends a message to the active tab's content script when available.
 * @param {unknown} message
 * @returns {Promise<void>}
 */
async function sendToActiveTab(message) {
  if (!activeTabId) return;

  try {
    await chrome.tabs.sendMessage(activeTabId, message);
  } catch {
    // Content scripts are unavailable on restricted pages.
  }
}

/**
 * Triggers the configured action when a screen-time limit is reached.
 * @param {'total_limit' | 'site_limit'} reason
 * @param {'notify' | 'overlay' | 'block'} action
 * @param {string} [domain]
 * @returns {Promise<void>}
 */
async function triggerAction(reason, action, domain) {
  const title = reason === "total_limit"
    ? "Daily screen time limit reached"
    : `Site limit reached: ${domain}`;
  const message = reason === "total_limit"
    ? "You have reached your total daily browsing limit."
    : `You have reached your limit for ${domain}.`;

  if (action === "notify") {
    await sendNotification(title, message);
    return;
  }

  if (action === "overlay") {
    await sendToActiveTab({
      type: "SHOW_BREAK",
      payload: { reason, domain }
    });
    return;
  }

  if (action === "block") {
    await sendToActiveTab({
      type: "SHOW_BLOCK",
      payload: { reason, domain }
    });
  }
}

/**
 * Evaluates daily and per-site limits plus hearing dose warnings.
 * @returns {Promise<void>}
 */
async function checkLimits() {
  const [settings, today] = await Promise.all([
    Storage.getSettings(),
    Storage.getToday()
  ]);

  if (!settings.enabled) return;

  if (today.totalMs >= settings.dailyLimitMs) {
    await triggerAction("total_limit", settings.actionOnLimit);
  }

  for (const [domain, limitMs] of Object.entries(settings.siteLimits)) {
    const usedMs = today.siteTimes[domain] || 0;
    if (usedMs >= limitMs) {
      await triggerAction("site_limit", settings.actionOnLimit, domain);
    }
  }

  const dosePercent = AudioAnalyser.getDosePercent(today.soundDose);
  if (dosePercent >= settings.hearingWarnAt && !today.hearingWarned) {
    await sendNotification(
      "Hearing budget warning",
      `Your hearing dose is at ${dosePercent}%. Consider lowering volume.`
    );
    await Storage.setTodayFlag("hearingWarned", true);
  }
}

/**
 * Shows a break overlay on the active tab and records the break.
 * @param {string} type
 * @returns {Promise<void>}
 */
async function triggerBreak(type) {
  const settings = await Storage.getSettings();

  await sendToActiveTab({
    type: "SHOW_BREAK",
    payload: {
      reason: type,
      durationSec: settings.breakDurationSec
    }
  });

  const today = await Storage.getToday();
  await Storage.setTodayFlag("breakCount", today.breakCount + 1);
}

/**
 * Sends an end-of-day summary notification and archives today's log.
 * @returns {Promise<void>}
 */
async function sendDailySummary() {
  const today = await Storage.getToday();
  const dosePercent = AudioAnalyser.getDosePercent(today.soundDose);
  const summary = [
    `Screen time: ${formatMs(today.totalMs)}`,
    `Breaks taken: ${today.breakCount}`,
    `Hearing dose: ${dosePercent}%`
  ].join(" • ");

  await sendNotification("HealthGuard daily summary", summary);
  await Storage.archiveToday();
}

/**
 * Resets today's fast-access counters without archiving.
 * @returns {Promise<void>}
 */
async function resetToday() {
  await chrome.storage.local.set({
    today: {
      date: todayKey(),
      totalMs: 0,
      siteTimes: {},
      soundDose: 0,
      hearingWarned: false,
      breakCount: 0
    }
  });
}

/**
 * Activates tracking for a tab by id.
 * @param {number} tabId
 * @returns {Promise<void>}
 */
async function activateTab(tabId) {
  await pauseCurrent();
  activeTabId = tabId;

  try {
    const tab = await chrome.tabs.get(tabId);
    const domain = domainOf(tab.url);

    if (!domain) {
      activeDomain = null;
      return;
    }

    activeDomain = domain;
    startTimer(activeDomain);
  } catch {
    activeDomain = null;
  }
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install") {
    await Storage.setDefaults();
    await chrome.tabs.create({
      url: chrome.runtime.getURL("onboarding/onboarding.html")
    });
  }

  await ensureAlarms();
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await activateTab(tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId !== activeTabId) return;
  if (changeInfo.status !== "complete") return;
  if (!tab.url) return;

  await pauseCurrent();

  const domain = domainOf(tab.url);
  if (!domain) {
    activeDomain = null;
    return;
  }

  activeDomain = domain;
  startTimer(activeDomain);
});

chrome.idle.onStateChanged.addListener(async (idleState) => {
  isIdle = idleState !== "active";

  if (isIdle) {
    await pauseCurrent();
    return;
  }

  if (activeDomain) {
    startTimer(activeDomain);
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  switch (alarm.name) {
    case ALARM_FLUSH:
      await flushSessionToStorage();
      await checkLimits();
      break;

    case ALARM_BREAK:
      await triggerBreak("scheduled");
      break;

    case ALARM_POSTURE:
      await sendNotification(
        "Posture check",
        "Sit upright with feet flat, monitor at eye level, and elbows near 90 degrees."
      );
      break;

    case ALARM_HYDRATE:
      await sendNotification(
        "Hydration reminder",
        "Time to drink water."
      );
      break;

    case ALARM_SUMMARY:
      await sendDailySummary();
      break;

    default:
      break;
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case "GET_TODAY":
        sendResponse(await Storage.getToday());
        return;

      case "GET_SETTINGS":
        sendResponse(await Storage.getSettings());
        return;

      case "GET_REMINDERS": {
        const [breakAlarm, hydrateAlarm] = await Promise.all([
          chrome.alarms.get(ALARM_BREAK),
          chrome.alarms.get(ALARM_HYDRATE)
        ]);
        const now = Date.now();
        sendResponse({
          breakMs: breakAlarm?.scheduledTime
            ? Math.max(0, breakAlarm.scheduledTime - now)
            : null,
          hydrateMs: hydrateAlarm?.scheduledTime
            ? Math.max(0, hydrateAlarm.scheduledTime - now)
            : null
        });
        return;
      }

      case "SET_SETTINGS": {
        await Storage.setSettings(message.payload?.settings || {});
        await ensureAlarms();
        sendResponse({ ok: true });
        return;
      }

      case "FORCE_BREAK":
        await triggerBreak("manual");
        sendResponse({ ok: true });
        return;

      case "SOUND_EXPOSURE": {
        const today = await Storage.getToday();
        const { dB, durationMs } = message.payload || {};
        const newDose = AudioAnalyser.addExposure(today.soundDose, dB, durationMs);
        const delta = newDose - today.soundDose;
        const updated = await Storage.addSoundDose(delta);
        sendResponse({
          ok: true,
          soundDose: updated.soundDose,
          dosePercent: AudioAnalyser.getDosePercent(updated.soundDose)
        });
        return;
      }

      case "DISMISS_BREAK":
        console.log("Break dismissed", message.payload);
        sendResponse({ ok: true });
        return;

      case "RESET_TODAY":
        await resetToday();
        sendResponse({ ok: true });
        return;

      case "EXPORT_DATA":
        sendResponse({ data: await Storage.exportJSON() });
        return;

      default:
        sendResponse({ ok: false, error: "Unknown message type" });
    }
  })().catch((error) => {
    sendResponse({ ok: false, error: String(error) });
  });

  return true;
});
