(function () {
  const CHIP_ROW_ID = "joblens-chip-row";
  const CHIP_ID = "joblens-chip"; // kept for future re-enable
  const APPLICANT_CHIP_ID = "joblens-applicant-chip";
  const EXPERIENCE_CHIP_ID = "joblens-experience-chip";
  const COMPENSATION_CHIP_ID = "joblens-compensation-chip";
  const SPONSORSHIP_CHIP_ID = "joblens-sponsorship-chip";

  const waitForElement = (selectors, timeoutMs = 10000) => {
    return new Promise((resolve) => {
      const start = Date.now();
      const timer = setInterval(() => {
        const element = selectors
          .map((s) => (typeof s === "function" ? s() : document.querySelector(s)))
          .find(Boolean);
        if (element) {
          clearInterval(timer);
          resolve(element);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          resolve(null);
        }
      }, 300);
    });
  };

  const getJobDescriptionText = () => {
    const descriptionEl =
      document.querySelector(".jobs-description__content") ||
      document.querySelector(".jobs-description-content__text") ||
      document.querySelector(".show-more-less-html__markup") ||
      document.querySelector(".jobs-box__html-content") ||
      document.querySelector('[data-testid="expandable-text-box"]') ||
      document.querySelector(".jobs-description");
    return descriptionEl ? descriptionEl.innerText.trim() : "";
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

  const getApplicantCount = () => {
    // Old layout
    const el = document.querySelector(".jobs-premium-applicant-insights__list-num");
    if (el) return el.textContent.trim();

    const panel = document.querySelector('[data-sdui-screen*="SemanticJobDetails"]') || document.body;

    // New layout pattern B first: premium section <span>NUMBER</span> + sibling label (most accurate)
    // Label text varies: "total", "Applicants", etc.
    const APPLICANT_LABELS = /^(total|applicants?)$/i;
    for (const labelEl of panel.querySelectorAll("p, span")) {
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

    // New layout pattern A fallback: header summary text
    // e.g. "Over 100 people clicked apply", "Over 100 applicants", "69 people clicked apply"
    for (const node of panel.querySelectorAll("span, p")) {
      if (node.children.length === 0) {
        const m = node.textContent.trim().match(/^(?:over\s+)?(\d[\d,]*)\+?\s+(?:people\s+clicked\s+apply|applicants?)$/i);
        if (m) return m[1].replace(/,/g, "");
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

  const renderChipRow = (titleEl, sponsorshipResult, compResult, expResult, applicantCount, classification, languages) => {
    const existing = document.getElementById(CHIP_ROW_ID);
    if (existing) existing.remove();

    const row = document.createElement("div");
    row.id = CHIP_ROW_ID;
    row.className = "joblens-chip-row";

    // Order: Sponsorship → Applicants → Compensation → Experience → Language(s) → Software
    row.appendChild(buildSponsorshipChip(sponsorshipResult));
    row.appendChild(buildApplicantsChip(applicantCount));
    row.appendChild(buildCompensationChip(compResult));
    row.appendChild(buildExperienceChip(expResult));
    buildLanguageChips(languages).forEach(chip => row.appendChild(chip));
    row.appendChild(buildSoftwareChip(classification));

    titleEl.appendChild(row);
  };

  let lastJobKey = null;
  let lastApplicantCount = null;

  const getCurrentJobKey = () => {
    const m = window.location.href.match(/currentJobId=(\d+)/) ||
              window.location.href.match(/\/jobs\/view\/(\d+)/);
    return m ? m[1] : null;
  };

  const runClassifier = async () => {
    const jobKey = getCurrentJobKey();
    if (jobKey && jobKey === lastJobKey && document.getElementById(CHIP_ROW_ID)) {
      // Same job, chips already rendered — only re-run if applicant count has improved
      const freshCount = getApplicantCount();
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
        // Direct job view (new layout, no data-sdui-screen wrapper)
        // Title is a short <p> immediately before the location string (which contains "·")
        const descEl = document.querySelector('[data-testid="expandable-text-box"]');
        if (!descEl) return null;
        const allP = Array.from(document.querySelectorAll('p'));
        const descP = descEl.closest('p');
        const descIdx = descP ? allP.indexOf(descP) : allP.length;
        return allP.slice(0, descIdx).reverse().find(p => {
          const text = (p.childNodes[0]?.textContent || '').trim();
          return text.length >= 3 && text.length <= 120 &&
                 !text.includes('·') && !text.includes('$') && !text.includes('@') &&
                 !p.closest('a');
        }) || null;
      }
    ]);

    if (!titleEl || !window.JobLensClassifier) return;

    const descriptionText = getJobDescriptionText();
    if (!descriptionText) return;

    const classification = window.JobLensClassifier.classifyJobText({ title: titleEl.innerText.trim(), jd: descriptionText });
    const expResult = window.JobLensClassifier.extractExperienceRequirement(descriptionText);
    const compResult = window.JobLensClassifier.extractCompensation(descriptionText);
    const sponsorshipResult = window.JobLensClassifier.analyzeSponsorship(descriptionText);
    const languages = window.JobLensClassifier.extractLanguages(descriptionText, titleEl.innerText.trim());
    const applicantCount = getApplicantCount();

    lastJobKey = getCurrentJobKey();
    lastApplicantCount = applicantCount;
    renderChipRow(titleEl, sponsorshipResult, compResult, expResult, applicantCount, classification, languages);
    Highlighter.highlight(sponsorshipResult, descriptionText);
    Highlighter.highlightExperience(expResult?.rawMatch);
    Highlighter.highlightCompensation(compResult?.rawMatch);
    Highlighter.highlightLanguages(languages);
  };

  const observePage = () => {
    let debounceTimer;
    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runClassifier, 400);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  runClassifier();
  observePage();
})();
