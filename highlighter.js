const Highlighter = (function () {
  'use strict';

  const HIGHLIGHT_CLASS = 'h1b-sponsor-highlight';
  const HIGHLIGHT_POSITIVE_CLASS = 'h1b-sponsor-highlight-positive';

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

  function highlightPhraseInElement(element, phrase, cssClass) {
    const highlightClass = cssClass || HIGHLIGHT_CLASS;
    try {
      const phraseTrimmed = phrase.trim();
      const phraseLower = phraseTrimmed.toLowerCase();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);

      let textNode;
      while ((textNode = walker.nextNode())) {
        if (textNode.parentElement && (
          textNode.parentElement.classList.contains(HIGHLIGHT_CLASS) ||
          textNode.parentElement.classList.contains(HIGHLIGHT_POSITIVE_CLASS)
        )) {
          continue;
        }

        const nodeText = textNode.textContent;
        const index = nodeText.toLowerCase().indexOf(phraseLower);

        if (index !== -1) {
          const highlightSpan = document.createElement('span');
          highlightSpan.className = highlightClass;
          highlightSpan.textContent = nodeText.substring(index, index + phraseTrimmed.length);

          const parent = textNode.parentNode;
          if (!parent) return false;

          if (index > 0) parent.insertBefore(document.createTextNode(nodeText.substring(0, index)), textNode);
          parent.insertBefore(highlightSpan, textNode);
          const after = nodeText.substring(index + phraseTrimmed.length);
          if (after) parent.insertBefore(document.createTextNode(after), textNode);
          parent.removeChild(textNode);

          return true;
        }
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
      for (const selector of DESCRIPTION_SELECTORS) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            if (highlightPhraseInElement(el, phrase, cssClass)) break;
          }
        } catch (e) {
          continue;
        }
      }
    }
  }

  function removeHighlights() {
    try {
      document.querySelectorAll(`.${HIGHLIGHT_CLASS}, .${HIGHLIGHT_POSITIVE_CLASS}`).forEach(el => {
        const parent = el.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(el.textContent), el);
          parent.normalize();
        }
      });
    } catch (e) {}
  }

  function highlight(analysisResult, jobDescriptionText) {
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

    if (matchedPhrases.length > 0) {
      setTimeout(() => highlightSentences(matchedPhrases, cssClass), 300);
    }
  }

  function highlightExperience(rawMatch) {
    if (!rawMatch) return;
    setTimeout(() => highlightSentences([rawMatch], 'h1b-experience-highlight'), 300);
  }

  function highlightCompensation(rawMatch) {
    if (!rawMatch) return;
    setTimeout(() => highlightSentences([rawMatch], 'joblens-compensation-highlight'), 300);
  }

  function highlightLanguages(languages) {
    if (!languages || languages.length === 0) return;
    const keywords = languages.flatMap(lang => lang.matchedKeywords || []);
    if (keywords.length === 0) return;
    setTimeout(() => highlightSentences(keywords, 'joblens-language-highlight'), 300);
  }

  return { highlight, highlightExperience, highlightCompensation, highlightLanguages, removeHighlights };
})();
