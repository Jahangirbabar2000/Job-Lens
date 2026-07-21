(function () {
  'use strict';

  const STORAGE_KEY = 'joblensBlockedCompanies';
  const APPLIED_KEY = 'joblensAppliedCompanies';
  const SHOW_APPLIED_KEY = 'joblensShowApplied';
  const APPLIED_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
  const SEED = ['jack'];

  // ── Context guard ────────────────────────────────────────────────────────────
  // After the extension is reloaded, old content scripts lose their chrome API
  // context. Any chrome.* call throws "Extension context invalidated". Guard
  // every storage call so stale scripts fail silently instead of spamming errors.

  const isContextValid = () => {
    try { return !!chrome.runtime?.id; } catch { return false; }
  };

  // ── Storage helpers ──────────────────────────────────────────────────────────

  const normalize = (name) => name.trim().toLowerCase();

  const getBlocklist = () =>
    new Promise((resolve) => {
      if (!isContextValid()) return resolve([]);
      try {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
          if (chrome.runtime.lastError) return resolve([]);
          if (result[STORAGE_KEY] === undefined) {
            // First run — seed the list
            chrome.storage.local.set({ [STORAGE_KEY]: SEED }, () => resolve([...SEED]));
          } else {
            resolve(result[STORAGE_KEY]);
          }
        });
      } catch { resolve([]); }
    });

  const saveBlocklist = (list) =>
    new Promise((resolve) => {
      if (!isContextValid()) return resolve();
      try { chrome.storage.local.set({ [STORAGE_KEY]: list }, resolve); }
      catch { resolve(); }
    });

  const getAppliedCompanies = () =>
    new Promise((resolve) => {
      if (!isContextValid()) return resolve([]);
      try {
        chrome.storage.local.get([APPLIED_KEY], (result) => {
          if (chrome.runtime.lastError) return resolve([]);
          resolve(Array.isArray(result[APPLIED_KEY]) ? result[APPLIED_KEY] : []);
        });
      } catch { resolve([]); }
    });

  /** Entries with applied_at within the last 90 days (normalized name list for matching). */
  const getRecentAppliedNames = async () => {
    const list = await getAppliedCompanies();
    const cutoff = Date.now() - APPLIED_WINDOW_MS;
    const names = [];
    for (const entry of list) {
      if (!entry || !entry.name) continue;
      const at = entry.at ? new Date(entry.at).getTime() : NaN;
      if (!Number.isFinite(at) || at < cutoff) continue;
      names.push(normalize(entry.name));
    }
    return names;
  };

  /** When true, applied companies stay visible with a badge instead of being hidden. Default: hide. */
  const getShowApplied = () =>
    new Promise((resolve) => {
      if (!isContextValid()) return resolve(false);
      try {
        chrome.storage.local.get([SHOW_APPLIED_KEY], (result) => {
          if (chrome.runtime.lastError) return resolve(false);
          resolve(!!result[SHOW_APPLIED_KEY]);
        });
      } catch { resolve(false); }
    });

  const setAppliedBadge = (cardEl, show) => {
    let badge = cardEl.querySelector('.joblens-applied-badge');
    if (show) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'joblens-applied-badge';
        badge.textContent = 'Applied';
        badge.title = 'You applied to this company in the last 90 days';
        cardEl.style.position = 'relative';
        cardEl.appendChild(badge);
      }
    } else if (badge) {
      badge.remove();
    }
  };

  const addCompany = async (name) => {
    const key = normalize(name);
    if (!key) return;
    const list = await getBlocklist();
    if (!list.includes(key)) {
      list.push(key);
      await saveBlocklist(list);
    }
    applyToCards();
  };

  const removeCompany = async (name) => {
    const key = normalize(name);
    const list = await getBlocklist();
    const updated = list.filter((c) => c !== key);
    await saveBlocklist(updated);
    applyToCards();
  };

  // Partial match: stored "jack" will block "Jack & Jill Inc"; "google" blocks "Google LLC"
  const matchesList = (key, list) =>
    list.some((c) => key.includes(c) || c.includes(key));

  const isBlocked = async (name) => {
    const key = normalize(name);
    const list = await getBlocklist();
    return matchesList(key, list);
  };

  // ── DOM helpers ──────────────────────────────────────────────────────────────
  //
  // LinkedIn's new obfuscated React DOM (2025+):
  //   <div data-display-contents="true">          ← wrapper (hide this; covers card + gap)
  //     <div class="df04026f ...">                ← card container  (btn.parentElement.parentElement)
  //       <div class="_58a5ca3e ...">             ← card content
  //         <div role="button">…title, company…</div>
  //       </div>
  //       <div class="_8def67dc ...">             ← dismiss area
  //         <button aria-label="Dismiss X job">  ← STABLE anchor selector
  //       </div>
  //     </div>
  //   </div>
  //   <hr role="presentation">                   ← separator (hidden automatically with wrapper)
  //
  // Company name: walk <p> tags, skip multi-line headers / status lines / the job title itself.
  //   No class names or hrefs used — LinkedIn rotates all of those.

  const getAllCards = () => {
    const dismissBtns = document.querySelectorAll(
      'button[aria-label^="Dismiss "][aria-label$=" job"]'
    );
    const seen = new Set();
    const cards = [];
    for (const btn of dismissBtns) {
      const cardEl = btn.parentElement && btn.parentElement.parentElement;
      if (cardEl && !seen.has(cardEl)) {
        seen.add(cardEl);
        cards.push(cardEl);
      }
    }
    return cards;
  };

  const getCompanyFromCard = (cardEl) => {
    // The Dismiss button aria-label is always "Dismiss [Job Title] job" — stable, never obfuscated.
    // Use it to extract the job title so we can exclude it from company-name candidates.
    const dismissBtn = cardEl.querySelector('button[aria-label^="Dismiss "][aria-label$=" job"]');
    const jobTitle = dismissBtn
      ? dismissBtn.getAttribute('aria-label')
          .replace(/^Dismiss\s+/i, '').replace(/\s+job$/i, '').trim().toLowerCase()
      : '';

    // Patterns that mark a <p> as NOT a company name:
    //   · or • separators, location keywords, status words, salary ($), "Easy Apply", etc.
    const SKIP_RE = /[·•]|\bago\b|\bapplicants?\b|\bremote\b|\bhybrid\b|\bon.?site\b|\brepost|\bpromot|\bactively\b|\breviewing\b|\bviewed\b|\beasy.apply\b|\$[\d(]/i;

    for (const p of cardEl.querySelectorAll('p')) {
      const t = (p.innerText || '').trim();
      if (!t || t.length < 2 || t.length > 100) continue;
      if (t.includes('\n')) continue;               // multi-line = selected-card header, not a name
      if (jobTitle && t.toLowerCase().includes(jobTitle)) continue; // skip if job title is a substring
      if (SKIP_RE.test(t)) continue;
      return t;
    }

    return null;
  };

  // Hide the data-display-contents wrapper so the following <hr> gap also disappears
  const getHideTarget = (cardEl) => {
    const parent = cardEl.parentElement;
    if (parent && parent.hasAttribute('data-display-contents')) return parent;
    return cardEl;
  };

  // ── Apply blocklist + applied list to all visible cards ─────────────────────

  const applyToCards = async () => {
    const [blocklist, appliedNames, showApplied] = await Promise.all([
      getBlocklist(),
      getRecentAppliedNames(),
      getShowApplied(),
    ]);
    const cards = getAllCards();
    for (const card of cards) {
      const company = getCompanyFromCard(card);
      if (!company) continue;
      const key = normalize(company);
      const blocked = matchesList(key, blocklist);
      const applied = !blocked && matchesList(key, appliedNames);
      const target = getHideTarget(card);
      target.classList.toggle('joblens-blocked-card', blocked);
      // Hide when applied unless the user opted to show them with a badge
      target.classList.toggle('joblens-applied-card', applied && !showApplied);
      setAppliedBadge(card, applied && showApplied);
    }
  };

  // ── Hover ✕ buttons on left-panel cards ──────────────────────────────────────

  // WeakSet instead of a data attribute: when the extension is reloaded without
  // a page refresh, the new script gets a fresh WeakSet so it re-injects all cards,
  // automatically removing stale buttons whose mousedown listeners are from the
  // now-dead previous context.
  const _injected = new WeakSet();

  const injectHoverButtons = () => {
    const cards = getAllCards();
    for (const card of cards) {
      if (_injected.has(card)) continue;

      // Remove any leftover buttons injected by a previous (now-invalid) context
      card.querySelectorAll('.joblens-block-btn').forEach(b => b.remove());

      _injected.add(card);
      card.style.position = 'relative';

      const btn = document.createElement('button');
      btn.className = 'joblens-block-btn';
      btn.title = 'Block this company';
      btn.textContent = '✕';

      // mousedown + capture phase fires before LinkedIn's click-based navigation handler
      btn.addEventListener('mousedown', async (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        const company = getCompanyFromCard(card);
        if (!company) return;
        await addCompany(company);
        btn.textContent = '✓';
        btn.style.background = '#1e7f34';
      }, true);

      // CSS :hover can't target these cards (no stable parent class), so use JS events
      card.addEventListener('mouseenter', () => { btn.style.display = 'flex'; });
      card.addEventListener('mouseleave', () => {
        if (btn.textContent !== '✓') btn.style.display = 'none';
      });

      card.appendChild(btn);
    }
  };

  // ── Observe the job list for new cards ───────────────────────────────────────

  const observeJobList = () => {
    let debounce;
    const observer = new MutationObserver(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        applyToCards();
        injectHoverButtons();
      }, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  const requestMaybeSync = () => {
    if (!isContextValid()) return;
    try {
      chrome.runtime.sendMessage({ type: 'joblensMaybeSync' }, () => {
        void chrome.runtime.lastError; // ignore if SW not ready
      });
    } catch { /* stale context */ }
  };

  const watchStorage = () => {
    if (!isContextValid()) return;
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[STORAGE_KEY] || changes[APPLIED_KEY] || changes[SHOW_APPLIED_KEY]) {
          applyToCards();
        }
      });
    } catch { /* stale context */ }
  };

  // ── Init ─────────────────────────────────────────────────────────────────────

  const init = () => {
    requestMaybeSync();
    applyToCards();
    injectHoverButtons();
    observeJobList();
    watchStorage();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  window.JobLensBlocker = {
    getBlocklist,
    getAppliedCompanies,
    getRecentAppliedNames,
    addCompany,
    removeCompany,
    isBlocked,
    applyToCards,
    injectHoverButtons,
  };
})();
