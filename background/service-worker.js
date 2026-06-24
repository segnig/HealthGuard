import { Storage } from "../utils/storage.js";
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
  await chrome.alarms.create(ALARM_FLUSH, { periodInMinutes: 0.5 });
  await chrome.alarms.create(ALARM_BREAK, { periodInMinutes: 20 });
  await chrome.alarms.create(ALARM_POSTURE, { periodInMinutes: 30 });
  await chrome.alarms.create(ALARM_HYDRATE, { periodInMinutes: 60 });
  await chrome.alarms.create(ALARM_SUMMARY, {
    when: nextOccurrenceOf(21, 0),
    periodInMinutes: 24 * 60
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

// Alarm handler and message API are implemented in the next step.
