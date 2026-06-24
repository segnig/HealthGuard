import { todayKey } from "./time-utils.js";

const DB_NAME = "healthguard_db";
const DB_VERSION = 1;
const STORE_NAME = "daily_logs";
const LOG_RETENTION_DAYS = 30;

/** @type {Readonly<Settings>} */
export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  dailyLimitMs: 14_400_000,
  siteLimits: {},
  breakIntervalMin: 20,
  breakDurationSec: 20,
  maxDB: 85,
  hearingWarnAt: 80,
  scheduleStart: 9,
  scheduleEnd: 18,
  postureIntervalMin: 30,
  hydrateIntervalMin: 60,
  actionOnLimit: "notify",
  blueLightHour: 20,
  autoExport: false
});

/**
 * @returns {import('./storage.js').TodayRecord}
 */
function freshToday() {
  return {
    date: todayKey(),
    totalMs: 0,
    siteTimes: {},
    soundDose: 0,
    hearingWarned: false,
    breakCount: 0
  };
}

/**
 * @param {Record<string, unknown>} target
 * @param {Record<string, unknown>} source
 * @returns {Record<string, unknown>}
 */
function deepMerge(target, source) {
  const output = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;

    const existing = output[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing)
    ) {
      output[key] = deepMerge(/** @type {Record<string, unknown>} */ (existing), /** @type {Record<string, unknown>} */ (value));
      continue;
    }

    output[key] = value;
  }

  return output;
}

/**
 * @param {IDBRequest} request
 * @returns {Promise<unknown>}
 */
function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Opens the HealthGuard IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = /** @type {IDBOpenDBRequest} */ (event.target).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "date" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Runs a function against an IndexedDB object store inside a transaction.
 * @template T
 * @param {string} storeName
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => Promise<T> | T} fn
 * @returns {Promise<T>}
 */
async function dbRequest(storeName, mode, fn) {
  const db = await openDB();
  const tx = db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);
  const result = await fn(store);

  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  return result;
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeCsv(value) {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Removes archived logs older than the retention window.
 * @returns {Promise<void>}
 */
async function pruneOldLogs() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOG_RETENTION_DAYS);
  const cutoffKey = cutoff.toISOString().slice(0, 10);

  await dbRequest(STORE_NAME, "readwrite", async (store) => {
    const logs = /** @type {import('./storage.js').TodayRecord[]} */ (await idbRequest(store.getAll()));
    await Promise.all(
      logs
        .filter((log) => log.date < cutoffKey)
        .map((log) => idbRequest(store.delete(log.date)))
    );
  });
}

export const Storage = {
  /**
   * Returns today's fast-access record, archiving stale data when the date rolls over.
   * @returns {Promise<import('./storage.js').TodayRecord>}
   */
  async getToday() {
    const key = todayKey();
    const { today } = await chrome.storage.local.get("today");

    if (!today) {
      const fresh = freshToday();
      await chrome.storage.local.set({ today: fresh });
      return fresh;
    }

    if (today.date !== key) {
      await Storage.archiveToday();
      const { today: updated } = await chrome.storage.local.get("today");
      return updated ?? freshToday();
    }

    return today;
  },

  /**
   * Increments per-domain and total screen time atomically.
   * @param {string} domain
   * @param {number} ms
   * @returns {Promise<import('./storage.js').TodayRecord>}
   */
  async addTime(domain, ms) {
    const safeMs = Number.isFinite(ms) ? Math.max(0, ms) : 0;
    const today = await Storage.getToday();
    const siteTimes = { ...today.siteTimes };
    siteTimes[domain] = (siteTimes[domain] || 0) + safeMs;

    const updated = {
      ...today,
      siteTimes,
      totalMs: today.totalMs + safeMs
    };

    await chrome.storage.local.set({ today: updated });
    return updated;
  },

  /**
   * Increments today's cumulative hearing dose.
   * @param {number} delta
   * @returns {Promise<import('./storage.js').TodayRecord>}
   */
  async addSoundDose(delta) {
    const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    const today = await Storage.getToday();
    const updated = {
      ...today,
      soundDose: today.soundDose + safeDelta
    };

    await chrome.storage.local.set({ today: updated });
    return updated;
  },

  /**
   * Returns stored settings merged with defaults.
   * @returns {Promise<import('./storage.js').Settings>}
   */
  async getSettings() {
    const { settings } = await chrome.storage.local.get("settings");
    return /** @type {import('./storage.js').Settings} */ (
      deepMerge(structuredClone(DEFAULT_SETTINGS), settings || {})
    );
  },

  /**
   * Deep-merges partial settings into storage.
   * @param {Partial<import('./storage.js').Settings>} partial
   * @returns {Promise<import('./storage.js').Settings>}
   */
  async setSettings(partial) {
    const current = await Storage.getSettings();
    const merged = /** @type {import('./storage.js').Settings} */ (deepMerge(current, partial));
    await chrome.storage.local.set({ settings: merged });
    return merged;
  },

  /**
   * Writes default settings when none are stored yet.
   * @returns {Promise<import('./storage.js').Settings>}
   */
  async setDefaults() {
    const { settings } = await chrome.storage.local.get("settings");

    if (!settings) {
      const defaults = structuredClone(DEFAULT_SETTINGS);
      await chrome.storage.local.set({ settings: defaults });
      return defaults;
    }

    const merged = await Storage.getSettings();
    await chrome.storage.local.set({ settings: merged });
    return merged;
  },

  /**
   * Sets a single boolean or numeric flag on today's record.
   * @param {keyof Pick<import('./storage.js').TodayRecord, 'hearingWarned' | 'breakCount'>} key
   * @param {boolean | number} value
   * @returns {Promise<import('./storage.js').TodayRecord>}
   */
  async setTodayFlag(key, value) {
    const today = await Storage.getToday();
    const updated = {
      ...today,
      [key]: value
    };

    await chrome.storage.local.set({ today: updated });
    return updated;
  },

  /**
   * Persists today's snapshot to IndexedDB and resets local fast-access state.
   * @returns {Promise<import('./storage.js').TodayRecord>}
   */
  async archiveToday() {
    const { today } = await chrome.storage.local.get("today");

    if (today?.date) {
      await dbRequest(STORE_NAME, "readwrite", async (store) => {
        await idbRequest(store.put(today));
      });
      await pruneOldLogs();
    }

    const fresh = freshToday();
    await chrome.storage.local.set({ today: fresh });
    return fresh;
  },

  /**
   * Returns the newest N archived daily logs from IndexedDB.
   * @param {number} days
   * @returns {Promise<import('./storage.js').TodayRecord[]>}
   */
  async getLogs(days) {
    const safeDays = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
    if (safeDays === 0) return [];

    const logs = await dbRequest(STORE_NAME, "readonly", async (store) => {
      return /** @type {import('./storage.js').TodayRecord[]} */ (await idbRequest(store.getAll()));
    });

    return logs.sort((a, b) => b.date.localeCompare(a.date)).slice(0, safeDays);
  },

  /**
   * Exports all archived logs as formatted JSON.
   * @returns {Promise<string>}
   */
  async exportJSON() {
    const logs = await dbRequest(STORE_NAME, "readonly", async (store) => {
      return /** @type {import('./storage.js').TodayRecord[]} */ (await idbRequest(store.getAll()));
    });

    logs.sort((a, b) => a.date.localeCompare(b.date));
    return JSON.stringify(logs, null, 2);
  },

  /**
   * Exports all archived logs as CSV with a header row.
   * @returns {Promise<string>}
   */
  async exportCSV() {
    const logs = await dbRequest(STORE_NAME, "readonly", async (store) => {
      return /** @type {import('./storage.js').TodayRecord[]} */ (await idbRequest(store.getAll()));
    });

    logs.sort((a, b) => a.date.localeCompare(b.date));

    const header = "date,totalMs,soundDose,breakCount,siteTimes";
    const rows = logs.map((log) => [
      escapeCsv(log.date),
      escapeCsv(log.totalMs),
      escapeCsv(log.soundDose),
      escapeCsv(log.breakCount),
      escapeCsv(JSON.stringify(log.siteTimes || {}))
    ].join(","));

    return [header, ...rows].join("\n");
  }
};

/**
 * @typedef {Object} TodayRecord
 * @property {string} date
 * @property {number} totalMs
 * @property {Record<string, number>} siteTimes
 * @property {number} soundDose
 * @property {boolean} hearingWarned
 * @property {number} breakCount
 */

/**
 * @typedef {Object} Settings
 * @property {boolean} enabled
 * @property {number} dailyLimitMs
 * @property {Record<string, number>} siteLimits
 * @property {number} breakIntervalMin
 * @property {number} breakDurationSec
 * @property {number} maxDB
 * @property {number} hearingWarnAt
 * @property {number} scheduleStart
 * @property {number} scheduleEnd
 * @property {number} postureIntervalMin
 * @property {number} hydrateIntervalMin
 * @property {'notify' | 'overlay' | 'block'} actionOnLimit
 * @property {number} blueLightHour
 * @property {boolean} autoExport
 */
