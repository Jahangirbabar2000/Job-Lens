'use strict';

const BLOCKED_KEY = 'joblensBlockedCompanies';
const APPLIED_KEY = 'joblensAppliedCompanies';
const SHOW_APPLIED_KEY = 'joblensShowApplied';
const APPLIED_HIDE_MODE_KEY = 'joblensAppliedHideMode';
const APPLIED_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

const normalize = (s) => s.trim().toLowerCase();

const getLocal = (keys) =>
  new Promise((resolve) => chrome.storage.local.get(keys, (r) => resolve(r || {})));

const setLocal = (obj) =>
  new Promise((resolve) => chrome.storage.local.set(obj, resolve));

const displayName = (name) =>
  name ? name.charAt(0).toUpperCase() + name.slice(1) : '';

const formatRelative = (ts) => {
  if (!ts) return 'Never';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
};

const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

// ── Tabs ──────────────────────────────────────────────────────────────────────

const setTab = (tab) => {
  document.querySelectorAll('.tab').forEach((el) => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  document.querySelectorAll('.panel').forEach((el) => {
    el.classList.toggle('active', el.id === `panel-${tab}`);
  });
  const sub = document.getElementById('header-sub');
  if (tab === 'applied') {
    sub.textContent = 'Control how applied jobs are hidden on LinkedIn.';
  } else {
    sub.textContent = 'Jobs from blocked companies are hidden on LinkedIn.';
  }
};

// ── Blocked tab ───────────────────────────────────────────────────────────────

const renderBlocked = async () => {
  const stored = await getLocal([BLOCKED_KEY]);
  const list = stored[BLOCKED_KEY] || [];
  const container = document.getElementById('blocked-list');
  const emptyState = document.getElementById('blocked-empty');
  const footer = document.getElementById('blocked-footer');

  Array.from(container.querySelectorAll('.company-row')).forEach((el) => el.remove());

  if (list.length === 0) {
    emptyState.style.display = 'block';
    footer.textContent = '';
    return;
  }

  emptyState.style.display = 'none';
  footer.textContent = `${list.length} compan${list.length === 1 ? 'y' : 'ies'} blocked`;

  const sorted = [...list].sort((a, b) => a.localeCompare(b));

  for (const company of sorted) {
    const row = document.createElement('div');
    row.className = 'company-row';

    const name = document.createElement('span');
    name.className = 'company-name';
    name.textContent = displayName(company);
    name.title = company;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.title = `Unblock ${company}`;
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', async () => {
      const current = await getLocal([BLOCKED_KEY]);
      const updated = (current[BLOCKED_KEY] || []).filter((c) => c !== normalize(company));
      await setLocal({ [BLOCKED_KEY]: updated });
      renderBlocked();
    });

    row.appendChild(name);
    row.appendChild(removeBtn);
    container.appendChild(row);
  }

  // Re-apply any live search filter so removing a company keeps the filter active
  const inputEl = document.getElementById('add-input');
  if (inputEl?.value.trim()) applyBlockedFilter(inputEl.value);
};

// ── Blocked list filter (debounced, fuzzy) ───────────────────────────────────

// Subsequence fuzzy match: every char of q must appear in order in target.
// Exact substring always wins first; fuzzy catches "amzn" → "amazon", etc.
const fuzzyMatch = (q, target) => {
  if (target.includes(q)) return true;
  let qi = 0;
  for (let i = 0; i < target.length && qi < q.length; i++) {
    if (target[i] === q[qi]) qi++;
  }
  return qi === q.length;
};

let _filterTimer = null;

const applyBlockedFilter = (raw) => {
  const q = raw.trim().toLowerCase();
  const rows = [...document.querySelectorAll('#blocked-list .company-row')];
  const emptyState = document.getElementById('blocked-empty');
  const footer = document.getElementById('blocked-footer');

  if (rows.length === 0) return; // no list yet — let renderBlocked handle empty state

  let visible = 0;
  rows.forEach(row => {
    const name = (row.querySelector('.company-name')?.textContent || '').toLowerCase();
    const show = !q || fuzzyMatch(q, name);
    row.style.display = show ? '' : 'none';
    if (show) visible++;
  });

  if (visible === 0) {
    emptyState.style.display = 'block';
    emptyState.textContent = `No match for "${q}"`;
    footer.textContent = '';
  } else {
    emptyState.style.display = 'none';
    footer.textContent = q
      ? `${visible} of ${rows.length} compan${rows.length === 1 ? 'y' : 'ies'} blocked`
      : `${rows.length} compan${rows.length === 1 ? 'y' : 'ies'} blocked`;
  }
};

const addBlockedCompany = async (raw) => {
  const key = normalize(raw);
  if (!key) return;
  const stored = await getLocal([BLOCKED_KEY]);
  const list = stored[BLOCKED_KEY] || [];
  if (!list.includes(key)) {
    list.push(key);
    await setLocal({ [BLOCKED_KEY]: list });
  }
  renderBlocked();
};

// ── Applied tab ───────────────────────────────────────────────────────────────

const renderSyncMeta = async () => {
  const meta = document.getElementById('sync-meta');
  const status = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'joblensGetSyncStatus' }, (res) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(res);
    });
  });

  if (!status) {
    meta.innerHTML = 'Sync status unavailable';
    return;
  }

  const lines = [`Last synced: ${formatRelative(status.lastSyncAt)}`];
  if (status.lastError) {
    lines.push(`<span class="error">Sync failed — using last list (${status.lastError})</span>`);
  }
  meta.innerHTML = lines.join('<br>');
};

const renderShowToggle = async () => {
  const stored = await getLocal([SHOW_APPLIED_KEY]);
  document.getElementById('show-applied-toggle').checked = !!stored[SHOW_APPLIED_KEY];
};

const renderHideMode = async () => {
  const stored = await getLocal([APPLIED_HIDE_MODE_KEY]);
  const mode = stored[APPLIED_HIDE_MODE_KEY] === 'role' ? 'role' : 'company';
  document.querySelectorAll('#hide-mode-seg .seg-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  document.getElementById('hide-mode-desc').textContent = mode === 'role'
    ? 'Hides exact applied roles; other roles at those companies stay visible'
    : 'Hides all roles from companies you applied to';
  const showBar = document.getElementById('show-applied-bar');
  const showDesc = showBar && showBar.querySelector('.toggle-label span');
  if (showDesc) {
    showDesc.textContent = mode === 'role'
      ? 'When on, exact applied roles stay visible with a red badge'
      : 'When on, applied companies stay visible with an orange badge';
  }
};

const renderApplied = async () => {
  const stored = await getLocal([APPLIED_KEY, SHOW_APPLIED_KEY]);
  const list = Array.isArray(stored[APPLIED_KEY]) ? stored[APPLIED_KEY] : [];
  const showApplied = !!stored[SHOW_APPLIED_KEY];
  const cutoff = Date.now() - APPLIED_WINDOW_MS;
  const recent = list.filter((e) => {
    if (!e || !e.name) return false;
    const at = e.at ? new Date(e.at).getTime() : NaN;
    return Number.isFinite(at) && at >= cutoff;
  });

  const container = document.getElementById('applied-list');
  const emptyState = document.getElementById('applied-empty');
  const footer = document.getElementById('applied-footer');

  Array.from(container.querySelectorAll('.company-row')).forEach((el) => el.remove());
  await renderShowToggle();
  await renderHideMode();

  if (recent.length === 0) {
    emptyState.style.display = 'block';
    footer.textContent = '';
    await renderSyncMeta();
    return;
  }

  emptyState.style.display = 'none';
  const mode = showApplied ? 'shown with badge' : 'hidden';
  footer.textContent = `${recent.length} compan${recent.length === 1 ? 'y' : 'ies'} ${mode} (last 90 days)`;

  const sorted = [...recent].sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of sorted) {
    const row = document.createElement('div');
    row.className = 'company-row';

    const nameWrap = document.createElement('div');
    nameWrap.className = 'company-name';
    nameWrap.title = entry.name;

    const name = document.createElement('span');
    name.textContent = displayName(entry.name);

    const sub = document.createElement('span');
    sub.className = 'company-sub';
    sub.textContent = formatDate(entry.at);

    nameWrap.appendChild(name);
    if (sub.textContent) nameWrap.appendChild(sub);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.title = `Remove ${entry.name} until next sync`;
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', async () => {
      const current = await getLocal([APPLIED_KEY]);
      const updated = (current[APPLIED_KEY] || []).filter(
        (c) => normalize(c.name) !== normalize(entry.name)
      );
      await setLocal({ [APPLIED_KEY]: updated });
      renderApplied();
    });

    row.appendChild(nameWrap);
    row.appendChild(removeBtn);
    container.appendChild(row);
  }

  await renderSyncMeta();
};

const syncNow = async () => {
  const btn = document.getElementById('sync-btn');
  btn.disabled = true;
  btn.textContent = 'Syncing…';
  await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'joblensMaybeSync', force: true }, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
  btn.disabled = false;
  btn.textContent = 'Sync now';
  await renderApplied();
};

// ── Wire up ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  renderBlocked();
  renderApplied();

  // Trigger a gated sync when popup opens (no-op if synced within 24h)
  chrome.runtime.sendMessage({ type: 'joblensMaybeSync' }, () => {
    void chrome.runtime.lastError;
    renderApplied();
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => setTab(tab.dataset.tab));
  });

  const input = document.getElementById('add-input');
  const btn = document.getElementById('add-btn');

  btn.addEventListener('click', () => {
    const val = input.value.trim();
    if (val) {
      addBlockedCompany(val);
      input.value = '';
      applyBlockedFilter(''); // clear filter so the newly added company is visible
      input.focus();
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btn.click();
  });

  input.addEventListener('input', () => {
    clearTimeout(_filterTimer);
    _filterTimer = setTimeout(() => applyBlockedFilter(input.value), 200);
  });

  document.getElementById('sync-btn').addEventListener('click', syncNow);

  document.getElementById('show-applied-toggle').addEventListener('change', async (e) => {
    await setLocal({ [SHOW_APPLIED_KEY]: e.target.checked });
    await renderApplied();
  });

  document.querySelectorAll('#hide-mode-seg .seg-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await setLocal({ [APPLIED_HIDE_MODE_KEY]: btn.dataset.mode });
      await renderHideMode();
    });
  });
});
