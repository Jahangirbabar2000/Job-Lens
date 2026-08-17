const Highlighter = (function () {
  'use strict';

  const HIGHLIGHT_CLASS = 'h1b-sponsor-highlight';
  const HIGHLIGHT_POSITIVE_CLASS = 'h1b-sponsor-highlight-positive';

  // Every class we inject. removeHighlights() only knew about the two sponsorship
  // classes, so experience/compensation/language spans survived each re-render and
  // got re-wrapped on the next pass — producing nested
  // <span class="joblens-compensation-highlight"><span class="…">$150K</span></span>
  // that grew one level deeper every time the observer fired.
  const ALL_HIGHLIGHT_CLASSES = [
    HIGHLIGHT_CLASS,
    HIGHLIGHT_POSITIVE_CLASS,
    'h1b-experience-highlight',
    'joblens-compensation-highlight',
    'joblens-language-highlight'
  ];

  const DESCRIPTION_SELECTORS = [
    '[data-testid="expandable-text-box"]',
    '.jobs-description-content__text',
    '.show-more-less-html__markup',
    '.jobs-description__text',
    '.jobs-box__html-content',
    '.jobs-description-content',
    '[class*="jobs-description"]',
    '[class*="description-content"]',
    '.jobs-box--fadeout',
    '[class*="compensation"]',
    '[class*="benefits"]',
    '[class*="job-details"]',
    '.jobs-details__main-content',
    '.jobs-search__job-details'
  ];

  const _escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Build a finder for a phrase: single words use \b word boundaries so that
  // "react" does NOT match inside "reacting", "reactive", etc.
  function _makeFinder(phrase) {
    const isSingleWord = !/\s/.test(phrase.trim());
    if (isSingleWord) {
      return new RegExp(`\\b${_escRe(phrase.trim())}\\b`, 'i');
    }
    // Multi-word phrase: plain case-insensitive substring match is fine
    return null; // signals: use indexOf
  }

  function highlightPhraseInElement(element, phrase, cssClass) {
    const highlightClass = cssClass || HIGHLIGHT_CLASS;
    try {
      const phraseTrimmed = phrase.trim();
      const phraseLower = phraseTrimmed.toLowerCase();
      const finder = _makeFinder(phraseTrimmed);
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);

      let textNode;
      while ((textNode = walker.nextNode())) {
        if (textNode.parentElement &&
            ALL_HIGHLIGHT_CLASSES.some(c => textNode.parentElement.classList.contains(c))) {
          continue;
        }

        const nodeText = textNode.textContent;
        let index, matchLength;
        if (finder) {
          const m = finder.exec(nodeText);
          if (!m) continue;
          index = m.index;
          matchLength = m[0].length;
        } else {
          index = nodeText.toLowerCase().indexOf(phraseLower);
          if (index === -1) continue;
          matchLength = phraseTrimmed.length;
        }

        const highlightSpan = document.createElement('span');
        highlightSpan.className = highlightClass;
        highlightSpan.textContent = nodeText.substring(index, index + matchLength);

        const parent = textNode.parentNode;
        if (!parent) return false;

        if (index > 0) parent.insertBefore(document.createTextNode(nodeText.substring(0, index)), textNode);
        parent.insertBefore(highlightSpan, textNode);
        const after = nodeText.substring(index + matchLength);
        if (after) parent.insertBefore(document.createTextNode(after), textNode);
        parent.removeChild(textNode);

        return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  function highlightSentences(matchedPhrases, cssClass) {
    const seen = new Set();
    const uniquePhrases = matchedPhrases.filter(p => {
      const lower = p.toLowerCase().trim();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });

    for (const phrase of uniquePhrases) {
      // Stop at the first container that matched. The selector list is ordered
      // most- to least-specific and the containers nest, so continuing past a hit
      // re-highlighted the same phrase once per remaining selector.
      let highlighted = false;
      for (const selector of DESCRIPTION_SELECTORS) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            if (highlightPhraseInElement(el, phrase, cssClass)) { highlighted = true; break; }
          }
        } catch (e) {
          continue;
        }
        if (highlighted) break;
      }
    }
  }

  // The four highlight entry points each used to schedule their own 300ms pass.
  // Queue them into a single flush so a re-render costs one DOM walk, not four.
  let _pending = [];
  let _flushTimer = null;

  function scheduleHighlight(phrases, cssClass) {
    if (!phrases || phrases.length === 0) return;
    _pending.push({ phrases, cssClass });
    clearTimeout(_flushTimer);
    _flushTimer = setTimeout(() => {
      const batch = _pending;
      _pending = [];
      _flushTimer = null;
      for (const item of batch) highlightSentences(item.phrases, item.cssClass);
    }, 300);
  }

  function removeHighlights() {
    try {
      const selector = ALL_HIGHLIGHT_CLASSES.map(c => `.${c}`).join(', ');
      document.querySelectorAll(selector).forEach(el => {
        const parent = el.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(el.textContent), el);
          parent.normalize();
        }
      });
    } catch (e) {}
  }

  function highlight(analysisResult) {
    // Runs first in the render pass, so this clears every class before the
    // experience/compensation/language passes are queued behind it.
    removeHighlights();

    if (analysisResult.status !== 'no' && analysisResult.status !== 'yes') return;
    if (analysisResult.confidence === 'low') return;

    let matchedPhrases, cssClass;

    if (analysisResult.status === 'no') {
      matchedPhrases = analysisResult.details.strongNegative.length > 0
        ? analysisResult.details.strongNegative
        : analysisResult.details.moderateNegative;
      cssClass = HIGHLIGHT_CLASS;
    } else {
      matchedPhrases = analysisResult.details.strongPositive.length > 0
        ? analysisResult.details.strongPositive
        : analysisResult.details.moderatePositive;
      cssClass = HIGHLIGHT_POSITIVE_CLASS;
    }

    scheduleHighlight(matchedPhrases, cssClass);
  }

  function highlightExperience(rawMatch) {
    if (!rawMatch) return;
    scheduleHighlight([rawMatch], 'h1b-experience-highlight');
  }

  function highlightCompensation(rawMatch) {
    if (!rawMatch) return;
    scheduleHighlight([rawMatch], 'joblens-compensation-highlight');
  }

  function highlightLanguages(languages) {
    if (!languages || languages.length === 0) return;
    const keywords = languages.flatMap(lang => lang.matchedKeywords || []);
    scheduleHighlight(keywords, 'joblens-language-highlight');
  }

  return { highlight, highlightExperience, highlightCompensation, highlightLanguages, removeHighlights };
})();
