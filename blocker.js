(function () {
  'use strict';

  const STORAGE_KEY = 'joblensBlockedCompanies';
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
  const isBlocked = async (name) => {
    const key = normalize(name);
    const list = await getBlocklist();
    return list.some((c) => key.includes(c) || c.includes(key));
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
  // Company name: first <p> after the job-title <a href="/jobs/view/..."> link (structural, stable).
  //   Fallback: legacy ._78ccd462 / p.bec82545 selectors in case of older DOM variants.

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
    // Strategy 1 (most stable): anchor off the job-title <a href="/jobs/view/..."> link.
    // LinkedIn always places the company name in the first <p> after the title anchor.
    // Using an href pattern avoids obfuscated class names that LinkedIn rotates.
    const jobLink = cardEl.querySelector('a[href*="/jobs/view"]');
    if (jobLink) {
      // Case A: <p> is a direct next sibling of the <a>
      const directNext = jobLink.nextElementSibling;
      if (directNext && directNext.tagName === 'P' && directNext.innerText.trim()) {
        return directNext.innerText.trim();
      }
      // Case B: <a> is wrapped in a heading/strong — look for first <p> in the same parent
      const linkParent = jobLink.parentElement;
      if (linkParent) {
        for (const p of linkParent.querySelectorAll('p')) {
          const t = p.innerText.trim();
          if (t) return t;
        }
      }
    }

    // Strategy 2: legacy obfuscated class selectors (kept as fallback in case
    // LinkedIn hasn't migrated all regions / users see the old DOM)
    const companyContainer = cardEl.querySelector('._78ccd462');
    if (companyContainer) {
      const p = companyContainer.querySelector('p');
      if (p && p.innerText.trim()) return p.innerText.trim();
    }
    for (const p of cardEl.querySelectorAll('p.bec82545')) {
      if (!p.classList.contains('af237846') && p.innerText.trim()) {
        return p.innerText.trim();
      }
    }

    return null;
  };

  // Hide the data-display-contents wrapper so the following <hr> gap also disappears
  const getHideTarget = (cardEl) => {
    const parent = cardEl.parentElement;
    if (parent && parent.hasAttribute('data-display-contents')) return parent;
    return cardEl;
  };

  // ── Apply blocklist to all visible cards ─────────────────────────────────────

  const applyToCards = async () => {
    const list = await getBlocklist();
    const cards = getAllCards();
    for (const card of cards) {
      const company = getCompanyFromCard(card);
      if (!company) continue;
      const key = normalize(company);
      const blocked = list.some((c) => key.includes(c) || c.includes(key));
      const target = getHideTarget(card);
      target.classList.toggle('joblens-blocked-card', blocked);
    }
  };

  // ── Hover ✕ buttons on left-panel cards ──────────────────────────────────────

  const INJECTED_ATTR = 'data-joblens-block-injected';

  const injectHoverButtons = () => {
    const cards = getAllCards();
    for (const card of cards) {
      if (card.hasAttribute(INJECTED_ATTR)) continue;
      card.setAttribute(INJECTED_ATTR, '1');

      const btn = document.createElement('button');
      btn.className = 'joblens-block-btn';
      btn.title = 'Block this company';
      btn.textContent = '✕';

      // Use mousedown (fires before click) + capture phase so LinkedIn's own
      // card-navigation handler — which runs on click/bubble — can't win the race
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
      card.addEventListener('mouseenter', () => {
        btn.style.display = 'flex';
      });
      card.addEventListener('mouseleave', () => {
        // Keep visible after confirming (green ✓ state)
        if (btn.textContent !== '✓') btn.style.display = 'none';
      });

      // Absolutely position at bottom-right of the card
      card.style.position = 'relative';
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

  // ── Init ─────────────────────────────────────────────────────────────────────

  const init = () => {
    applyToCards();
    injectHoverButtons();
    observeJobList();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  window.JobLensBlocker = {
    getBlocklist,
    addCompany,
    removeCompany,
    isBlocked,
    applyToCards,
    injectHoverButtons,
  };
})();
