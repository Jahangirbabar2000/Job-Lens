(function () {
  // Build marker on <html>. Content scripts run in an isolated world, so their
  // globals are invisible from the DevTools console — this attribute is the one
  // reliable way to confirm from the page which build is actually live.
  document.documentElement.setAttribute("data-joblens", "loaded");

  const CHIP_ROW_ID = "joblens-chip-row";
  const CHIP_ID = "joblens-chip"; // kept for future re-enable
  const APPLICANT_CHIP_ID = "joblens-applicant-chip";
  const EXPERIENCE_CHIP_ID = "joblens-experience-chip";
  const COMPENSATION_CHIP_ID = "joblens-compensation-chip";
  const SPONSORSHIP_CHIP_ID = "joblens-sponsorship-chip";

  const findFirst = (selectors) =>
    selectors
      .map((s) => (typeof s === "function" ? s() : document.querySelector(s)))
      .find(Boolean) || null;

  // Check synchronously before arming the poll. The old version only looked
  // inside setInterval, so every call paid a full tick even when the element was
  // already on the page — which is the common case, since we are usually invoked
  // from a mutation that just added it.
  const POLL_MS = 80;
  const waitForElement = (selectors, timeoutMs = 10000) => {
    const immediate = findFirst(selectors);
    if (immediate) return Promise.resolve(immediate);

    return new Promise((resolve) => {
      const start = Date.now();
      const timer = setInterval(() => {
        const element = findFirst(selectors);
        if (element) {
          clearInterval(timer);
          resolve(element);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          resolve(null);
        }
      }, POLL_MS);
    });
  };

  const DESCRIPTION_SELECTORS = [
    ".jobs-description__content",
    ".jobs-description-content__text",
    ".show-more-less-html__markup",
    ".jobs-box__html-content",
    '[data-testid="expandable-text-box"]',
    ".jobs-description",
  ];

  // Return the first candidate that actually holds text. Two traps here, both of
  // which made this give up while the description was plainly on screen:
  // a selector can match several elements (the job description AND the company
  // "About" box), and innerText is "" for anything the browser hasn't laid out
  // yet — LinkedIn's lazy columns and collapsed sections hit that constantly.
  // textContent still has the copy in that case.
  const getDescriptionEl = () => {
    for (const selector of DESCRIPTION_SELECTORS) {
      for (const el of document.querySelectorAll(selector)) {
        if (((el.innerText || el.textContent) || "").trim()) return el;
      }
    }
    return null;
  };

  const getJobDescriptionText = () => {
    const el = getDescriptionEl();
    if (!el) return "";
    return ((el.innerText || el.textContent) || "").trim();
  };

  // The right-hand job-details column. Everything that identifies the current
  // job — title, meta line, description — lives inside it. Scoping matters: the
  // left results panel comes first in the DOM, so a document-wide scan reaches
  // the job cards before the detail pane and anchors on the wrong paragraph.
  const getDetailPaneRoot = () => {
    const descEl = getDescriptionEl();
    if (!descEl) return null;
    return descEl.closest('[data-testid="lazy-column"]') ||
           descEl.closest(".jobs-search__job-details") ||
           null;
  };

  const buildTooltip = (classification) => {
    const { score, details } = classification;
    if (!details) return `Score: ${score}`;

    const sectionScores = details.sectionScores || {};
    const topHits = details.topHits || [];
    const formatHits = (hits) =>
      hits.map((h) => `${h.keyword} (${h.count > 1 ? h.count + "x" : "1x"}, ${h.section})`).join(", ") || "None";

    return [
      `Score: ${score}`,
      `Title override: ${details.titleOverrideScore ?? 0}`,
      `Title keywords: ${details.titleKeywordScore ?? 0}`,
      `Degree signal: ${details.degreeScore ?? 0}`,
      `Sections: responsibilities ${sectionScores.responsibilities ?? 0}, requirements ${sectionScores.requirements ?? 0}, about ${sectionScores.about ?? 0}, other ${sectionScores.other ?? 0}`,
      `Top hits: ${formatHits(topHits)}`
    ].join("\n");
  };

  const getChipConfig = (label) => {
    if (label === "Software") return { text: "Software Role", className: "joblens-chip--software" };
    if (label === "Not Software") return { text: "Not Software", className: "joblens-chip--not-software" };
    return { text: "Unclear Role", className: "joblens-chip--unclear" };
  };

  // Containers worth scanning for the applicant number. This used to fall back to
  // document.body, so every observer tick walked every <p> and <span> on the page —
  // thousands of nodes, several times a second. Scope it to the premium insights
  // block and the top card instead.
  const getApplicantScanRoots = (titleEl) => {
    const roots = [];
    const premium = document.querySelector('[id^="JobDetails_PremiumApplicantInsights"]');
    if (premium) roots.push(premium);
    const sdui = document.querySelector('[data-sdui-screen*="SemanticJobDetails"]');
    if (sdui) roots.push(sdui);
    if (titleEl) {
      // The meta line ("<location> · <recency> · <N> applicants") sits a few levels
      // above the title; three levels keeps the scan inside the top card.
      let top = titleEl;
      for (let i = 0; i < 3 && top.parentElement; i++) top = top.parentElement;
      roots.push(top);
    }
    return roots.length ? roots : [document.body];
  };

  const getApplicantCount = (titleEl) => {
    // Old layout
    const el = document.querySelector(".jobs-premium-applicant-insights__list-num");
    if (el) return el.textContent.trim();

    const roots = getApplicantScanRoots(titleEl);

    // New layout pattern B first: premium section <span>NUMBER</span> + sibling label (most accurate)
    // Label text varies: "total", "Applicants", etc.
    const APPLICANT_LABELS = /^(total|applicants?)$/i;
    for (const root of roots) {
      for (const labelEl of root.querySelectorAll("p, span")) {
        if (labelEl.children.length === 0 && APPLICANT_LABELS.test(labelEl.textContent.trim())) {
          const parent = labelEl.parentElement;
          if (parent) {
            for (const numEl of parent.querySelectorAll("span")) {
              if (numEl.children.length === 0 && /^\d[\d,]*$/.test(numEl.textContent.trim())) {
                return numEl.textContent.trim().replace(/,/g, "");
              }
            }
          }
        }
      }
    }

    // New layout pattern A fallback: header summary text
    // e.g. "Over 100 people clicked apply", "Over 100 applicants", "69 people clicked apply"
    for (const root of roots) {
      for (const node of root.querySelectorAll("span, p")) {
        if (node.children.length === 0) {
          const m = node.textContent.trim().match(/^(?:over\s+)?(\d[\d,]*)\+?\s+(?:people\s+clicked\s+apply|applicants?)$/i);
          if (m) return m[1].replace(/,/g, "");
        }
      }
    }

    return null;
  };

  const getApplicantChipClass = (countStr) => {
    const n = parseInt(countStr.replace(/,/g, ""), 10);
    if (n >= 1000) return "joblens-chip--applicants-extreme";
    if (n >= 500)  return "joblens-chip--applicants-very-high";
    if (n >= 300)  return "joblens-chip--applicants-high";
    if (n >= 100)  return "joblens-chip--applicants-medium";
    return "joblens-chip--applicants-low";
  };

  const makeChip = (id, className, text, tooltip) => {
    const chip = document.createElement("span");
    chip.id = id;
    chip.className = `joblens-chip ${className}`;
    chip.textContent = text;
    if (tooltip) chip.title = tooltip;
    return chip;
  };

  // 1. Sponsorship chip
  const buildSponsorshipChip = (result) => {
    if (!result) {
      return makeChip(SPONSORSHIP_CHIP_ID, "joblens-chip--sponsorship-yes", "Sponsorship", "No explicit denial found");
    }
    const { status, confidence, matchedKeywords } = result;
    if (status === "no") {
      let tooltip = `Confidence: ${confidence}`;
      if (matchedKeywords.length > 0) {
        tooltip += `\nMatched: ${matchedKeywords.slice(0, 5).join(", ")}`;
        if (matchedKeywords.length > 5) tooltip += ` (+${matchedKeywords.length - 5} more)`;
      }
      return makeChip(SPONSORSHIP_CHIP_ID, "joblens-chip--sponsorship-no", "No Sponsorship", tooltip);
    }
    // Default: treat all non-denial as potentially sponsoring
    const tooltip = confidence === "high" || confidence === "medium"
      ? `Confidence: ${confidence}\nMatched: ${matchedKeywords.slice(0, 5).join(", ")}`
      : "No explicit denial found";
    return makeChip(SPONSORSHIP_CHIP_ID, "joblens-chip--sponsorship-yes", "Sponsorship", tooltip);
  };

  // 2. Software role chip
  const buildSoftwareChip = (classification) => {
    const { text, className } = getChipConfig(classification.label);
    return makeChip(CHIP_ID, className, text, buildTooltip(classification));
  };

  // 3. Compensation chip
  const buildCompensationChip = (compResult) => {
    if (compResult) return makeChip(COMPENSATION_CHIP_ID, "joblens-chip--compensation", compResult.display);
    return makeChip(COMPENSATION_CHIP_ID, "joblens-chip--unknown", "? pay");
  };

  // 4. Experience chip
  const buildExperienceChip = (expResult) => {
    if (expResult) return makeChip(EXPERIENCE_CHIP_ID, "joblens-chip--experience", expResult.display);
    return makeChip(EXPERIENCE_CHIP_ID, "joblens-chip--unknown", "Exp: ?");
  };

  // 5. Applicants chip
  const buildApplicantsChip = (count) => {
    if (count) return makeChip(APPLICANT_CHIP_ID, getApplicantChipClass(count), `${count} applicants`);
    return makeChip(APPLICANT_CHIP_ID, "joblens-chip--unknown", "? applicants");
  };

  // 6. Language chips (0–2 elements)
  const buildLanguageChips = (languages) =>
    languages.map((lang, i) =>
      makeChip(`joblens-lang-chip-${i}`, "joblens-chip--language", lang.name)
    );

  // Where to drop the chip row so it gets its own line under the title.
  // The title sits inside a chain of display:contents wrappers and a
  // row-direction flex container; inserting next to it there makes the row
  // just another flex item, so the chips land beside the heading and fight it
  // for attention. Climb until we reach a node whose parent stacks its
  // children vertically, and insert after that.
  const getRowAnchor = (titleEl) => {
    let node = titleEl;
    for (let i = 0; i < 6 && node.parentElement; i++) {
      const cs = getComputedStyle(node.parentElement);
      const stacksVertically =
        cs.display === "block" ||
        cs.display === "grid" ||
        ((cs.display === "flex" || cs.display === "inline-flex") &&
          cs.flexDirection.startsWith("column"));
      if (stacksVertically) return node;
      node = node.parentElement;
    }
    return node;
  };

  const renderChipRow = (titleEl, sponsorshipResult, compResult, expResult, applicantCount, classification, languages) => {
    const existing = document.getElementById(CHIP_ROW_ID);
    if (existing) existing.remove();

    const row = document.createElement("div");
    row.id = CHIP_ROW_ID;
    row.className = "joblens-chip-row";

    // Order: Sponsorship → Applicants → Compensation → Experience → Language(s) → Software → Block
    row.appendChild(buildSponsorshipChip(sponsorshipResult));
    row.appendChild(buildApplicantsChip(applicantCount));
    row.appendChild(buildCompensationChip(compResult));
    row.appendChild(buildExperienceChip(expResult));
    buildLanguageChips(languages).forEach(chip => row.appendChild(chip));
    row.appendChild(buildSoftwareChip(classification));

    // Never nest the row inside the title <p> — a <div> in a <p> is invalid,
    // and the paragraph's line clamping can clip it out of view entirely.
    const anchor = getRowAnchor(titleEl);
    if (anchor.parentElement) {
      anchor.parentElement.insertBefore(row, anchor.nextSibling);
    } else {
      titleEl.appendChild(row);
    }
  };

  let lastJobKey = null;
  let lastApplicantCount = null;
  let lastTitleEl = null;

  const getCurrentJobKey = () => {
    const m = window.location.href.match(/currentJobId=(\d+)/) ||
              window.location.href.match(/\/jobs\/view\/(\d+)/);
    return m ? m[1] : null;
  };

  // LinkedIn rewrites this DOM constantly, so every bail-out below is a thing
  // that used to work and stopped. Say which one it was instead of returning
  // silently — a missing chip row is otherwise indistinguishable from a
  // classifier that decided not to render.
  const LOG = "[JobLens]";

  const runClassifier = async () => {
    try {
      await renderChips();
    } catch (err) {
      console.error(`${LOG} render failed:`, err);
    }
  };

  // Bumped on every entry to renderChips. A run that was waiting on the title or
  // description when the user moved to the next job must not write its (now
  // stale) chips over the newer run's — it checks the generation after each await.
  let runGeneration = 0;

  const renderChips = async () => {
    const myGen = ++runGeneration;
    const jobKey = getCurrentJobKey();
    if (jobKey && jobKey === lastJobKey && document.getElementById(CHIP_ROW_ID)) {
      // Same job, chips already rendered — only re-run if applicant count has improved
      const freshCount = getApplicantCount(lastTitleEl);
      if (freshCount === lastApplicantCount) return;
      // Premium section loaded with a better number — fall through to re-render
    }

    const titleEl = await waitForElement([
      ".job-details-jobs-unified-top-card__job-title",
      ".t-24.job-details-jobs-unified-top-card__job-title",
      ".jobs-unified-top-card__job-title",
      () => {
        // Search results side panel (new layout)
        const link = document.querySelector(
          '[data-sdui-screen*="SemanticJobDetails"] a[href*="/jobs/view/"]'
        );
        return link ? link.closest("p") : null;
      },
      () => {
        // New SDUI layout, no data-sdui-screen wrapper. The title is the <p>
        // wrapping the link to this job's own /jobs/view/<id>; matching on the
        // id from the URL keeps a left-panel card link from winning.
        const jobId = getCurrentJobKey();
        if (!jobId) return null;
        const pane = getDetailPaneRoot();
        for (const a of (pane || document).querySelectorAll(`a[href*="/jobs/view/${jobId}"]`)) {
          const p = a.closest("p");
          if (p) return p;
        }
        return null;
      },
      () => {
        // Direct job view (new SDUI layout, no data-sdui-screen wrapper).
        // The job title is the short <p> immediately ABOVE the top-card meta
        // line ("<location> · <recency> · <N> clicked apply"). We anchor to that
        // meta line instead of the description, because async-loaded sections
        // like "People you can reach out to" (peopleWhoCanHelp) sit just above
        // the description and their paragraphs otherwise won the reverse scan —
        // landing the chips in the wrong block.
        const isTitleP = (p) => {
          if (!p || p.closest('a')) return false;
          // Never treat a paragraph from a non-top-card section as the title.
          if (p.closest('[data-sdui-component*="peopleWhoCanHelp"]')) return false;
          const text = (p.childNodes[0]?.textContent || '').trim();
          return text.length >= 3 && text.length <= 120 &&
                 !text.includes('·') && !text.includes('$') && !text.includes('@');
        };

        const descEl = getDescriptionEl();
        // Scoped to the detail pane: a document-wide scan picks up the left
        // results panel, whose cards carry their own meta lines ("Viewed ·
        // 3 days ago") and win the findIndex below.
        const scope = getDetailPaneRoot() || document;
        const allP = Array.from(scope.querySelectorAll('p'));
        const descP = descEl ? descEl.closest('p') : null;
        const descIdx = descP ? allP.indexOf(descP) : allP.length;
        const head = allP.slice(0, descIdx);

        // Meta/location line: middot separators plus a recency/applicant signal.
        const metaIdx = head.findIndex(p => {
          const t = p.innerText.trim();
          return t.includes('·') && t.length <= 160 &&
            (/\d+\s*(second|minute|hour|day|week|month|year)s?\s*ago/i.test(t) ||
             /clicked apply|applicants?|reposted|promoted/i.test(t));
        });

        if (metaIdx > 0) {
          for (let i = metaIdx - 1; i >= 0; i--) {
            if (isTitleP(head[i])) return head[i];
          }
        }

        // Fallback: last qualifying <p> before the description (original
        // behaviour), still excluding the non-top-card sections.
        return head.reverse().find(isTitleP) || null;
      }
    ]);

    if (myGen !== runGeneration) return; // superseded while waiting for the title
    if (!titleEl) {
      console.warn(`${LOG} no title element matched — chips not rendered`);
      return;
    }
    if (!window.JobLensClassifier) {
      console.warn(`${LOG} classifier.js did not load (window.JobLensClassifier missing)`);
      return;
    }

    // The title lands before the description in the new layout, so on a fast
    // job switch we get here with an empty description. Poll for it rather than
    // bailing out and waiting on the next mutation — that costs a whole
    // debounce window for what is usually one more animation frame.
    let descriptionText = getJobDescriptionText();
    if (!descriptionText) {
      await waitForElement([() => getDescriptionEl()], 5000);
      if (myGen !== runGeneration) return;
      descriptionText = getJobDescriptionText();
    }
    if (!descriptionText) {
      console.warn(`${LOG} job description not found — chips not rendered`);
      return;
    }

    const classification = window.JobLensClassifier.classifyJobText({ title: titleEl.innerText.trim(), jd: descriptionText });
    const expResult = window.JobLensClassifier.extractExperienceRequirement(descriptionText);
    const compResult = window.JobLensClassifier.extractCompensation(descriptionText);
    const sponsorshipResult = window.JobLensClassifier.analyzeSponsorship(descriptionText);
    const languages = window.JobLensClassifier.extractLanguages(descriptionText, titleEl.innerText.trim());
    const applicantCount = getApplicantCount(titleEl);

    lastJobKey = getCurrentJobKey();
    lastApplicantCount = applicantCount;
    lastTitleEl = titleEl;
    renderChipRow(titleEl, sponsorshipResult, compResult, expResult, applicantCount, classification, languages);
    Highlighter.highlight(sponsorshipResult);
    Highlighter.highlightExperience(expResult?.rawMatch);
    Highlighter.highlightCompensation(compResult?.rawMatch);
    Highlighter.highlightLanguages(languages);
  };

  // Chips and highlight spans are DOM writes of our own; reacting to them
  // scheduled another pass, which wrote again.
  const isOwnNode = (node) => {
    if (node.nodeType !== 1) return false;
    const cls = node.getAttribute && node.getAttribute("class");
    return typeof cls === "string" && (cls.includes("joblens-") || cls.includes("h1b-"));
  };

  const isRelevant = (mutations) => {
    for (const m of mutations) {
      for (const n of m.addedNodes) if (!isOwnNode(n)) return true;
      for (const n of m.removedNodes) if (!isOwnNode(n)) return true;
    }
    return false;
  };

  // LinkedIn mutates the DOM continuously while a job loads, so a pure trailing
  // debounce kept getting pushed out and the chips arrived late. Three changes:
  // fire immediately when the job id changes (the classifier's own waits handle
  // a DOM that isn't ready yet), shorten the trailing wait, and cap it with a
  // max-wait so a steady mutation stream can't starve the render indefinitely.
  const DEBOUNCE_MS = 150;
  const MAX_WAIT_MS = 600;

  const observePage = () => {
    let debounceTimer = null;
    let maxWaitTimer = null;
    let seenJobKey = getCurrentJobKey();

    const fire = () => {
      clearTimeout(debounceTimer);
      clearTimeout(maxWaitTimer);
      debounceTimer = maxWaitTimer = null;
      runClassifier();
    };

    const schedule = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fire, DEBOUNCE_MS);
      if (!maxWaitTimer) maxWaitTimer = setTimeout(fire, MAX_WAIT_MS);
    };

    const observer = new MutationObserver((mutations) => {
      if (!isRelevant(mutations)) return;

      const jobKey = getCurrentJobKey();
      if (jobKey && jobKey !== seenJobKey) {
        seenJobKey = jobKey;
        // Drop the previous job's chips right away — they are wrong now, and
        // leaving them up reads as "stale" rather than "loading".
        const stale = document.getElementById(CHIP_ROW_ID);
        if (stale) stale.remove();
        fire();
        return;
      }
      schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  runClassifier();
  observePage();
})();
