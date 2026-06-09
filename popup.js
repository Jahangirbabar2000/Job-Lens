'use strict';

const STORAGE_KEY = 'joblensBlockedCompanies';
const normalize = (s) => s.trim().toLowerCase();

const getBlocklist = () =>
  new Promise((resolve) =>
    chrome.storage.local.get([STORAGE_KEY], (r) => resolve(r[STORAGE_KEY] || []))
  );

const saveBlocklist = (list) =>
  new Promise((resolve) => chrome.storage.local.set({ [STORAGE_KEY]: list }, resolve));

// ── Render ────────────────────────────────────────────────────────────────────

const render = async () => {
  const list = await getBlocklist();
  const container = document.getElementById('list-container');
  const emptyState = document.getElementById('empty-state');
  const footer = document.getElementById('footer');

  // Clear old rows (keep empty-state node)
  Array.from(container.querySelectorAll('.company-row')).forEach((el) => el.remove());

  if (list.length === 0) {
    emptyState.style.display = 'block';
    footer.textContent = '';
    return;
  }

  emptyState.style.display = 'none';
  footer.textContent = `${list.length} compan${list.length === 1 ? 'y' : 'ies'} blocked`;

  // Sort alphabetically for display
  const sorted = [...list].sort((a, b) => a.localeCompare(b));

  for (const company of sorted) {
    const row = document.createElement('div');
    row.className = 'company-row';

    const name = document.createElement('span');
    name.className = 'company-name';
    // Display with first letter capitalised
    name.textContent = company.charAt(0).toUpperCase() + company.slice(1);
    name.title = company;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.title = `Unblock ${company}`;
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', async () => {
      const current = await getBlocklist();
      const updated = current.filter((c) => c !== normalize(company));
      await saveBlocklist(updated);
      render();
    });

    row.appendChild(name);
    row.appendChild(removeBtn);
    container.appendChild(row);
  }
};

// ── Add ───────────────────────────────────────────────────────────────────────

const addCompany = async (raw) => {
  const key = normalize(raw);
  if (!key) return;
  const list = await getBlocklist();
  if (!list.includes(key)) {
    list.push(key);
    await saveBlocklist(list);
  }
  render();
};

// ── Wire up events ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  render();

  const input = document.getElementById('add-input');
  const btn = document.getElementById('add-btn');

  btn.addEventListener('click', () => {
    const val = input.value.trim();
    if (val) {
      addCompany(val);
      input.value = '';
      input.focus();
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btn.click();
  });
});
