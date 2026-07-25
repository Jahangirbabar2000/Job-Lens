(function () {
  'use strict';

  // Adds a "Block company" toggle to LinkedIn company pages
  // (https://www.linkedin.com/company/<slug>/...). Reuses the shared blocklist
  // API from blocker.js (window.JobLensBlocker), so a company blocked here is
  // hidden across the /jobs/ search panels too.

  const BTN_ID = 'joblens-company-block-btn';

  const isContextValid = () => {
    try { return !!chrome.runtime?.id; } catch { return false; }
  };

  const normalize = (s) => (s || '').trim().toLowerCase();
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  // Partial match: stored "google" matches "Google LLC" and vice-versa.
  const matchesList = (key, list) =>
    list.some((c) => c && (key.includes(c) || c.includes(key)));

  // Only act on an actual company profile, not /company/setup, /company/ (list), etc.
  const isCompanyProfile = () =>
    /^\/company\/[^/]+/.test(window.location.pathname);

  // ── Company name ─────────────────────────────────────────────────────────────
  // LinkedIn rotates class names, so try the known org top-card title first, then
  // fall back to the main <h1>. Prefer the title attribute (clean name, no badges).
  const getCompanyName = () => {
    for (const sel of [
      '.org-top-card-summary__title',
      'h1.org-top-card-summary__title',
      'main h1',
      'h1',
    ]) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const t = clean(el.getAttribute('title')) || clean(el.innerText);
      if (t && t.length <= 100) return t;
    }
    return null;
  };

  // Insert point: right after the company-name heading.
  const getTitleEl = () => {
    for (const sel of [
      '.org-top-card-summary__title',
      'h1.org-top-card-summary__title',
      'main h1',
      'h1',
    ]) {
      const el = document.querySelector(sel);
      if (el && clean(el.innerText)) return el;
    }
    return null;
  };

  const isBlocked = async (name) => {
    const B = window.JobLensBlocker;
    if (!B) return false;
    try {
      const list = await B.getBlocklist();
      return matchesList(normalize(name), list);
    } catch { return false; }
  };

  const renderState = (btn, blocked) => {
    btn.classList.toggle('joblens-chip--block', !blocked);
    btn.classList.toggle('joblens-chip--blocked-confirm', blocked);
    btn.textContent = blocked ? '✓ Company blocked' : '✕ Block company';
    btn.title = blocked
      ? 'This company is on your blocklist — click to unblock'
      : 'Hide this company from your LinkedIn job search';
  };

  const injectButton = async () => {
    if (!isContextValid() || !isCompanyProfile()) return;

    const company = getCompanyName();
    const titleEl = getTitleEl();
    if (!company || !titleEl) return;

    // The name, tagline and info list share one wrapper. Anchor the pill to the
    // top-right of that wrapper (absolute) so it lines up with the name without
    // pushing the tagline down. Re-applied each pass because LinkedIn re-renders
    // the header and drops inline styles.
    const anchor = titleEl.parentElement;
    if (!anchor) return;
    anchor.style.position = 'relative';

    let btn = document.getElementById(BTN_ID);
    // Already correctly placed inside the current anchor? Nothing to do.
    if (btn && btn.dataset.company === normalize(company) &&
        btn.isConnected && btn.parentElement === anchor) {
      return;
    }
    if (btn) btn.remove();

    btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.className = 'joblens-chip joblens-company-block-btn';
    btn.dataset.company = normalize(company);

    renderState(btn, await isBlocked(company));

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const B = window.JobLensBlocker;
      if (!B) return;
      const currentlyBlocked = await isBlocked(company);
      if (currentlyBlocked) {
        await B.removeCompany(company);
      } else {
        await B.addCompany(company);
      }
      renderState(btn, !currentlyBlocked);
    });

    // Pin the pill to the top-right of the name block.
    anchor.appendChild(btn);
  };

  // ── Observe for SPA navigation / late-rendered header ─────────────────────────

  const observe = () => {
    let debounce;
    const observer = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(injectButton, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  // Keep the button's blocked/unblocked state in sync when the list changes
  // elsewhere (popup, a job card, another tab).
  const watchStorage = () => {
    if (!isContextValid()) return;
    try {
      chrome.storage.onChanged.addListener(async (changes, area) => {
        if (area !== 'local' || !changes.joblensBlockedCompanies) return;
        const btn = document.getElementById(BTN_ID);
        const company = getCompanyName();
        if (btn && company) renderState(btn, await isBlocked(company));
      });
    } catch { /* stale context */ }
  };

  const init = () => {
    injectButton();
    observe();
    watchStorage();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
