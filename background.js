'use strict';

const APPLIED_KEY = 'joblensAppliedCompanies';
const LAST_SYNC_KEY = 'joblensAppliedLastSyncAt';
const LAST_SYNC_ERROR_KEY = 'joblensAppliedLastSyncError';
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ALARM_NAME = 'joblensAppliedDailySync';
const TAILORR_URL = 'http://localhost:8001/applications/companies?days=90';

const normalize = (name) => String(name || '').trim().toLowerCase();

const getLocal = (keys) =>
  new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result || {}));
  });

const setLocal = (obj) =>
  new Promise((resolve) => {
    chrome.storage.local.set(obj, resolve);
  });

/**
 * Sync applied companies from Tailorr if forced or last sync is older than 24h.
 * @param {{ force?: boolean }} opts
 * @returns {Promise<{ ok: boolean, skipped?: boolean, count?: number, error?: string, lastSyncAt?: number }>}
 */
async function maybeSyncApplied(opts = {}) {
  const force = !!opts.force;
  const stored = await getLocal([LAST_SYNC_KEY]);
  const lastSyncAt = stored[LAST_SYNC_KEY] || 0;
  const now = Date.now();

  if (!force && lastSyncAt && now - lastSyncAt < SYNC_INTERVAL_MS) {
    return { ok: true, skipped: true, lastSyncAt };
  }

  try {
    const res = await fetch(TAILORR_URL, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`Tailorr responded ${res.status}`);
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error('Unexpected response shape');
    }

    const byName = new Map();
    for (const row of data) {
      const name = normalize(row.company);
      if (!name) continue;
      const at = row.applied_at || null;
      const prev = byName.get(name);
      if (!prev || (at && (!prev.at || at > prev.at))) {
        byName.set(name, { name, at });
      }
    }

    const list = Array.from(byName.values());
    await setLocal({
      [APPLIED_KEY]: list,
      [LAST_SYNC_KEY]: now,
      [LAST_SYNC_ERROR_KEY]: null,
    });

    return { ok: true, skipped: false, count: list.length, lastSyncAt: now };
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    await setLocal({ [LAST_SYNC_ERROR_KEY]: message });
    return {
      ok: false,
      error: message,
      lastSyncAt: lastSyncAt || null,
    };
  }
}

function ensureDailyAlarm() {
  chrome.alarms.get(ALARM_NAME, (existing) => {
    if (existing) return;
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: 24 * 60 });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDailyAlarm();
  maybeSyncApplied({ force: true });
});

chrome.runtime.onStartup.addListener(() => {
  ensureDailyAlarm();
  maybeSyncApplied();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    maybeSyncApplied();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;

  if (message.type === 'joblensMaybeSync') {
    maybeSyncApplied({ force: !!message.force }).then(sendResponse);
    return true; // async response
  }

  if (message.type === 'joblensGetSyncStatus') {
    getLocal([LAST_SYNC_KEY, LAST_SYNC_ERROR_KEY, APPLIED_KEY]).then((stored) => {
      sendResponse({
        lastSyncAt: stored[LAST_SYNC_KEY] || null,
        lastError: stored[LAST_SYNC_ERROR_KEY] || null,
        count: Array.isArray(stored[APPLIED_KEY]) ? stored[APPLIED_KEY].length : 0,
      });
    });
    return true;
  }
});

ensureDailyAlarm();
