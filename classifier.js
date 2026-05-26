(function () {
  const SOFTWARE_SINGLE_WORDS = [
    "react",
    "typescript",
    "python",
    "node",
    "aws",
    "sql",
    "graphql",
    "git",
    "docker",
    "kubernetes",
    "api",
    "apis",
    "sdk",
    "sdks",
    "frontend",
    "backend",
    "devops",
    "sre",
    "swe",
    "platform",
    "cloud",
    "saas",
    "mobile"
  ];

  const SOFTWARE_PHRASES = [
    "node.js",
    "rest api",
    "ci/cd",
    "microservices",
    "full stack",
    "full-stack",
    "front end",
    "front-end",
    "back end",
    "back-end",
    "ship features",
    "pull requests",
    "infrastructure as code",
    "data pipeline",
    "event pipelines",
    "web app",
    "web application",
    "mobile app",
    "mobile application",
    "distributed systems",
    "observability",
    "instrumentation",
    "feature flags",
    "product engineering",
    "software engineer",
    "full-stack engineer",
    "backend services",
    "frontend engineering",
    "ai agents",
    "agent orchestration",
    "llm",
    "llms"
  ];

  const NON_SOFTWARE_SINGLE_WORDS = [
    "cad",
    "bom",
    "manufacturing",
    "semiconductor",
    "wafer",
    "pcb",
    "npi",
    "metrology",
    "gdt",
    "fmea",
    "dfmea",
    "pfmea",
    "tooling",
    "machining",
    "casting",
    "fixture",
    "fixtures",
    "assembly",
    "quality",
    "process",
    "production",
    "rf",
    "microwave",
    "solidworks",
    "creo",
    "kaizen",
    "cpk",
    "six sigma",
    "fea"
  ];

  const NON_SOFTWARE_PHRASES = [
    "mechanical engineering",
    "electrical engineering",
    "systems engineering",
    "material science",
    "materials science",
    "metallurgical engineering",
    "aerospace engineering",
    "new product introduction",
    "root cause analysis",
    "lean manufacturing",
    "finite element analysis",
    "reliability testing",
    "system integration",
    "clean room",
    "test fixtures",
    "field operations",
    "first article",
    "heat treat",
    "process capability",
    "stage gate",
    "design validation",
    "manufacturing process",
    "production test",
    "test equipment",
    "inspection criteria",
    "material review",
    "medical device",
    "wafer fabrication",
    "yield improvement",
    "engineering drawings",
    "gd&t",
    "npi rollout"
  ];

  const TITLE_POSITIVE_TERMS = [
    "full-stack",
    "full stack",
    "frontend",
    "backend",
    "software",
    "swe",
    "devops",
    "sre",
    "platform",
    "ai"
  ];

  const TITLE_NEGATIVE_TERMS = [
    "npi",
    "manufacturing",
    "mechanical",
    "electrical",
    "hardware",
    "process",
    "quality",
    "field",
    "test",
    "development engineer"
  ];

  const DEGREE_POSITIVE_PHRASES = ["computer science", "software engineering"];
  const DEGREE_NEGATIVE_PHRASES = [
    "mechanical",
    "electrical",
    "aerospace",
    "metallurgical",
    "material science",
    "materials science",
    "physics"
  ];

  const SECTION_HEADERS = [
    {
      type: "responsibilities",
      patterns: ["what you'll do", "what you will do", "responsibilities", "responsibility"]
    },
    {
      type: "requirements",
      patterns: [
        "requirements",
        "qualifications",
        "what we're looking for",
        "what we are looking for",
        "what you bring",
        "who you are"
      ]
    },
    {
      type: "about",
      patterns: [
        "about us",
        "about the team",
        "about the role",
        "about the company",
        "company",
        "who we are"
      ]
    }
  ];

  const SECTION_WEIGHTS = {
    title: 4,
    responsibilities: 2,
    requirements: 2,
    about: 0.5,
    other: 1
  };

  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const normalizeText = (text) =>
    text
      .toLowerCase()
      .replace(/\u2019/g, "'")
      .replace(/[\r\t]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const buildKeywordRegex = (term, isSingleWord) => {
    if (isSingleWord) {
      return new RegExp(`\\b${escapeRegex(term)}\\b`, "gi");
    }

    const normalized = term
      .toLowerCase()
      .replace(/[./]+/g, " ")
      .replace(/-/g, " ")
      .trim();
    const tokens = normalized.split(/\s+/).filter(Boolean);
    const joiner = "[\\s./-]+";
    const pattern = tokens.map(escapeRegex).join(joiner);
    return new RegExp(`\\b${pattern}\\b`, "gi");
  };

  const compileKeywords = (singleWords, phrases) => {
    const compiled = [];
    singleWords.forEach((term) => {
      compiled.push({ term, regex: buildKeywordRegex(term, true) });
    });
    phrases.forEach((term) => {
      compiled.push({ term, regex: buildKeywordRegex(term, false) });
    });
    return compiled;
  };

  const SOFTWARE_KEYWORDS = compileKeywords(
    SOFTWARE_SINGLE_WORDS,
    SOFTWARE_PHRASES
  );
  const NON_SOFTWARE_KEYWORDS = compileKeywords(
    NON_SOFTWARE_SINGLE_WORDS,
    NON_SOFTWARE_PHRASES
  );

  const countMatches = (text, regex) => {
    regex.lastIndex = 0;
    const matches = text.match(regex);
    return matches ? matches.length : 0;
  };

  const scoreTerms = (text, keywords, baseWeight, sectionWeight, sectionType) => {
    const hits = [];
    let score = 0;
    keywords.forEach(({ term, regex }) => {
      const count = countMatches(text, regex);
      if (count > 0) {
        const contribution = count * baseWeight * sectionWeight;
        score += contribution;
        hits.push({
          keyword: term,
          count,
          section: sectionType,
          weight: baseWeight,
          sectionWeight,
          contribution
        });
      }
    });
    return { score, hits };
  };

  const getTitleOverrideScore = (title) => {
    const normalized = normalizeText(title);
    const hasPositive = TITLE_POSITIVE_TERMS.some((term) =>
      normalized.includes(term)
    );
    const hasNegative = TITLE_NEGATIVE_TERMS.some((term) =>
      normalized.includes(term)
    );
    if (hasPositive && !hasNegative) {
      return 6;
    }
    if (hasNegative && !hasPositive) {
      return -6;
    }
    return 0;
  };

  const detectDegreeSignal = (text) => {
    const normalized = normalizeText(text);
    let score = 0;

    const positiveHit = DEGREE_POSITIVE_PHRASES.some((phrase) =>
      new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i").test(normalized)
    );
    const negativeHit = DEGREE_NEGATIVE_PHRASES.some((phrase) =>
      new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i").test(normalized)
    );

    const degreeContextRegex =
      /(b\.?s\.?|m\.?s\.?|bachelor'?s|master'?s|degree|bs|ms|beng|meng)\s+(?:in|of)?\s*(cs|c\.?s\.?|computer science|software engineering|ee|e\.?e\.?|me|m\.?e\.?|mechanical|electrical|aerospace|metallurgical|material science|materials science|physics)/gi;

    let match;
    while ((match = degreeContextRegex.exec(normalized)) !== null) {
      const value = match[2];
      if (/(cs|computer science|software engineering)/i.test(value)) {
        score += 5;
      } else if (
        /(ee|electrical|me|mechanical|aerospace|metallurgical|material|physics)/i.test(
          value
        )
      ) {
        score -= 5;
      }
    }

    if (positiveHit) {
      score += 5;
    }
    if (negativeHit) {
      score -= 5;
    }

    return score;
  };

  const insertHeaderBreaks = (text) => {
    let updated = text;
    SECTION_HEADERS.forEach(({ patterns }) => {
      patterns.forEach((pattern) => {
        const regex = new RegExp(`\\b${escapeRegex(pattern)}\\b\\s*[:\-]`, "gi");
        updated = updated.replace(regex, (match) => `\n${match}\n`);
      });
    });
    return updated;
  };

  const getHeaderType = (line) => {
    const cleaned = line.toLowerCase().replace(/[:\-]/g, "").trim();
    for (const header of SECTION_HEADERS) {
      if (header.patterns.some((pattern) => cleaned === pattern)) {
        return header.type;
      }
    }
    return null;
  };

  const splitIntoSections = (text) => {
    const textWithBreaks = insertHeaderBreaks(text.replace(/\r/g, "\n"));
    const lines = textWithBreaks.split(/\n+/).map((line) => line.trim());
    const sections = [{ type: "other", text: "" }];

    lines.forEach((line) => {
      if (!line) {
        return;
      }
      const headerType = getHeaderType(line);
      if (headerType) {
        sections.push({ type: headerType, text: "" });
        return;
      }
      sections[sections.length - 1].text += `${line} `;
    });

    return sections;
  };

  const getTopHits = (hits, limit = 8) =>
    [...hits]
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, limit)
      .map((hit) => ({
        keyword: hit.keyword,
        count: hit.count,
        section: hit.section,
        contribution: hit.contribution
      }));

  const classifyJobText = (jobDescription, jobTitle = "") => {
    let description = jobDescription;
    let title = jobTitle;

    if (typeof jobDescription === "object" && jobDescription !== null) {
      description =
        jobDescription.jd || jobDescription.description || jobDescription.text || "";
      title = jobDescription.title || jobTitle || "";
    }

    const normalizedDescription = normalizeText(description);
    const normalizedTitle = normalizeText(title);

    const titleOverrideScore = getTitleOverrideScore(normalizedTitle);
    const titleScoreResult = scoreTerms(
      normalizedTitle,
      SOFTWARE_KEYWORDS,
      1,
      SECTION_WEIGHTS.title,
      "title"
    );
    const titleNonSoftwareResult = scoreTerms(
      normalizedTitle,
      NON_SOFTWARE_KEYWORDS,
      -1,
      SECTION_WEIGHTS.title,
      "title"
    );
    const titleKeywordScore =
      titleScoreResult.score + titleNonSoftwareResult.score;

    const sections = splitIntoSections(description);
    const sectionScores = {
      responsibilities: 0,
      requirements: 0,
      about: 0,
      other: 0
    };
    const allHits = [...titleScoreResult.hits, ...titleNonSoftwareResult.hits];
    let sectionScoreTotal = 0;

    sections.forEach((section) => {
      const sectionWeight =
        SECTION_WEIGHTS[section.type] ?? SECTION_WEIGHTS.other;
      const normalizedSection = normalizeText(section.text);
      if (!normalizedSection) {
        return;
      }
      const software = scoreTerms(
        normalizedSection,
        SOFTWARE_KEYWORDS,
        1,
        sectionWeight,
        section.type
      );
      const nonSoftware = scoreTerms(
        normalizedSection,
        NON_SOFTWARE_KEYWORDS,
        -1,
        sectionWeight,
        section.type
      );
      const sectionScore = software.score + nonSoftware.score;
      sectionScores[section.type] += sectionScore;
      sectionScoreTotal += sectionScore;
      allHits.push(...software.hits, ...nonSoftware.hits);
    });

    const degreeScore = detectDegreeSignal(`${normalizedTitle} ${normalizedDescription}`);

    const totalScore =
      titleOverrideScore + titleKeywordScore + sectionScoreTotal + degreeScore;

    let label = "Unclear";
    if (totalScore > 5) {
      label = "Software";
    } else if (totalScore < -5) {
      label = "Not Software";
    }

    const topHits = getTopHits(allHits, 8);

    console.log("[JobLens] Score breakdown", {
      title,
      titleOverrideScore,
      titleKeywordScore,
      degreeScore,
      sectionScores,
      totalScore,
      topHits
    });

    return {
      label,
      score: totalScore,
      details: {
        titleOverrideScore,
        titleKeywordScore,
        degreeScore,
        sectionScores,
        topHits
      }
    };
  };

  // Tier 1: patterns that explicitly contain "experience" — high confidence
  const EXPERIENCE_PATTERNS_T1 = [
    // Range with experience word: "4-6 years of X experience", "2 to 5+ years of X experience"
    {
      re: /(\d+)(?:\s*[-–]\s*|\s+to\s+)(\d+)\+?\s+years?'?\s+(?:of\s+)?(?:[\w-]+\s+){0,5}experience/gi,
      parse: (m) => {
        const lo = parseInt(m[1], 10), hi = parseInt(m[2], 10);
        const plus = /\d+\+/.test(m[0]);
        return { min: lo, display: `${lo}–${hi}${plus ? '+' : ''} yrs` };
      }
    },
    // Written words + optional parens: "four (4) years of SWE experience"
    {
      re: /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:\(\d+\)\s+)?years?'?\s+of(?:\s+[\w-]+){0,5}\s+experience/gi,
      parse: (m) => {
        const n = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 }[m[1].toLowerCase()];
        return { min: n || 0, display: n === 1 ? "1 yr" : `${n} yrs` };
      }
    },
    // "(4) years of X experience"
    {
      re: /\((\d+)\)\s+years?'?\s+of(?:\s+[\w-]+){0,5}\s+experience/gi,
      parse: (m) => { const n = parseInt(m[1], 10); return { min: n, display: `${n} yrs` }; }
    },
    // "3 years of experience", "3+ years of experience" — lookbehind prevents matching upper bound of range
    {
      re: /(?<![-–])(\d+)\+?\s+years?'?\s+of(?:\s+[\w-]+){0,5}\s+experience/gi,
      parse: (m) => {
        const n = parseInt(m[1], 10);
        const plus = /^\d+\+/.test(m[0]);
        return { min: n, display: n === 1 && !plus ? "1 yr" : `${n}${plus ? '+' : ''} yrs` };
      }
    },
    // "3 years applicable experience", "3+ years X experience"
    {
      re: /(?<![-–])(\d+)\+?\s+years?'?\s+(?:[\w-]+\s+){0,4}experience/gi,
      parse: (m) => {
        const n = parseInt(m[1], 10);
        const plus = /^\d+\+/.test(m[0]);
        return { min: n, display: n === 1 && !plus ? "1 yr" : `${n}${plus ? '+' : ''} yrs` };
      }
    },
    // "5-year experience", "5-year software engineering experience"
    {
      re: /(\d+)-year\s+(?:[\w-]+\s+){0,4}experience/gi,
      parse: (m) => { const n = parseInt(m[1], 10); return { min: n, display: `${n} yrs` }; }
    }
  ];

  // Tier 2: bare year mentions — only used when no tier-1 match found
  const EXPERIENCE_PATTERNS_T2 = [
    // "8-12+ years"
    {
      re: /(\d+)\s*[-–]\s*(\d+)\+\s*years?/gi,
      parse: (m) => ({ min: parseInt(m[1], 10), display: `${m[1]}–${m[2]}+ yrs` })
    },
    // "3-5 years"
    {
      re: /(\d+)\s*[-–]\s*(\d+)\s*years?/gi,
      parse: (m) => ({ min: parseInt(m[1], 10), display: `${m[1]}–${m[2]} yrs` })
    },
    // "3 to 5 years"
    {
      re: /(\d+)\s+to\s+(\d+)\s*years?/gi,
      parse: (m) => ({ min: parseInt(m[1], 10), display: `${m[1]}–${m[2]} yrs` })
    },
    // "between 3 and 5 years"
    {
      re: /between\s+(\d+)\s+and\s+(\d+)\s*years?/gi,
      parse: (m) => ({ min: parseInt(m[1], 10), display: `${m[1]}–${m[2]} yrs` })
    },
    // "2+ years"
    {
      re: /(\d+)\+\s*years?/gi,
      parse: (m) => ({ min: parseInt(m[1], 10), display: `${m[1]}+ yrs` })
    },
    // "2 or more years"
    {
      re: /(\d+)\s+or\s+more\s+years?/gi,
      parse: (m) => ({ min: parseInt(m[1], 10), display: `${m[1]}+ yrs` })
    },
    // "more than 5 years", "over 5 years", "upwards of 5 years"
    {
      re: /(?:more\s+than|over|upwards?\s+of)\s+(\d+)\s*years?/gi,
      parse: (m) => ({ min: parseInt(m[1], 10), display: `${m[1]}+ yrs` })
    },
    // "minimum 5 years", "at least 5 years", "no less than 5 years"
    {
      re: /(?:minimum|at\s+(?:least|minimum)|a\s+minimum\s+of|no\s+less\s+than)\s+(\d+)\s*years?/gi,
      parse: (m) => ({ min: parseInt(m[1], 10), display: `${m[1]}+ yrs` })
    }
  ];

  const getMatchContext = (normalized, start) => {
    const win = normalized.substring(Math.max(0, start - 600), start).toLowerCase();
    const reqIdx = win.lastIndexOf('required');
    const prefIdx = Math.max(win.lastIndexOf('preferred'), win.lastIndexOf('nice to have'), win.lastIndexOf('nice-to-have'));
    if (reqIdx === -1 && prefIdx === -1) return 'neutral';
    return reqIdx >= prefIdx ? 'required' : 'preferred';
  };

  const collectExperienceMatches = (normalized, patterns) => {
    const collected = [];
    for (const { re, parse } of patterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(normalized)) !== null) {
        const start = m.index;
        const end = m.index + m[0].length;
        if (!collected.some((c) => start < c.end && end > c.start)) {
          const { min, display } = parse(m);
          collected.push({ min, display, rawMatch: m[0], start, end });
        }
      }
    }
    return collected.filter(c => c.min >= 0 && c.min <= 15);
  };

  const extractExperienceRequirement = (text) => {
    const normalized = normalizeText(text);
    const t1 = collectExperienceMatches(normalized, EXPERIENCE_PATTERNS_T1);
    const pool = t1.length ? t1 : collectExperienceMatches(normalized, EXPERIENCE_PATTERNS_T2);
    if (!pool.length) return null;
    // Prefer required-context matches; fall back to all if none are explicitly required
    const tagged = pool.map(m => ({ ...m, ctx: getMatchContext(normalized, m.start) }));
    const requiredPool = tagged.filter(m => m.ctx === 'required');
    const activePool = requiredPool.length > 0 ? requiredPool : tagged;
    const best = activePool.reduce((b, c) => (c.min > b.min ? c : b));
    return { display: best.display, rawMatch: best.rawMatch };
  };

  // ---- Sponsorship Analyzer ----

  const SPONSORSHIP_STRONG_POSITIVE = [
    /\bH1B\s+sponsorship\b/i,
    /\bH1B\s+visa\s+sponsorship\b/i,
    /\bH-1B\s+sponsorship\b/i,
    /\bvisa\s+sponsorship\b/i,
    /\bwork\s+visa\s+sponsorship\b/i,
    /\bemployment\s+visa\s+sponsorship\b/i,
    /\bsponsor\s+H1B\b/i,
    /\bsponsor\s+visa\b/i,
    /\bprovide\s+sponsorship\b/i,
    /\bsponsorship\s+available\b/i,
    /\bsponsorship\s+provided\b/i,
    /\boffers\s+sponsorship\b/i,
    /\bwilling\s+to\s+sponsor\b/i,
    /\bwill\s+sponsor\b/i,
    /\bcan\s+sponsor\b/i,
    /\bsponsor\s+for\s+international\s+candidates\b/i,
    /\binternational\s+sponsorship\b/i,
    /\bwork\s+authorization\s+sponsorship\b/i,
    /\bemployment\s+authorization\s+sponsorship\b/i,
    /\bTN\s+visa\b/i,
    /\bE-3\s+visa\b/i,
    /\bO-1\s+visa\b/i,
    /\bL-1\s+visa\b/i,
    /\bJ-1\s+visa\b/i,
    /\bOPT\s+to\s+H1B\b/i,
    /\bpleased\s+to\s+offer\s+visa\s+sponsorship\b/i,
    /\bpleased\s+to\s+offer\s+sponsorship\b/i,
    /\boffer\s+visa\s+sponsorship\b/i,
    /\boffer\s+sponsorship\b/i
  ];

  const SPONSORSHIP_MODERATE_POSITIVE = [
    /\bopen\s+to\s+international\s+candidates\b/i,
    /\binternational\s+applicants\s+welcome\b/i,
    /\bglobal\s+talent\b/i,
    /\bdiverse\s+candidates\b/i,
    /\binternational\s+experience\s+preferred\b/i,
    /\bimmigration\s+support\b/i,
    /\bimmigration\s+assistance\b/i,
    /\brelocation\s+and\s+immigration\b/i,
    /\bvisa\s+assistance\b/i
  ];

  const SPONSORSHIP_STRONG_NEGATIVE = [
    /\bU\.?S\.?\s+citizens?\s+only\b/i,
    /\bU\.?S\.?\s+citizenship\s+required\b/i,
    /\bmust\s+be\s+(a\s+)?U\.?S\.?\s+citizen\b/i,
    /\bmust\s+be\s+(a\s+)?United\s+States\s+citizen\b/i,
    /\bU\.?S\.?\s+citizenship\s+only\b/i,
    /\bnot\s+open\s+to\s+(visa\s+)?sponsorship\b/i,
    /\bnot\s+open\s+to\s+.*visa\s+sponsorship\b/i,
    /\bno\s+sponsorship\b/i,
    /\bdoes\s+not\s+sponsor\b/i,
    /\bcannot\s+sponsor\b/i,
    /\bcan't\s+sponsor\b/i,
    /\bnot\s+able\s+to\s+sponsor\b/i,
    /\bnot\s+able\s+to\s+sponsor\s+or\s+take\s+over\s+sponsorship\b/i,
    /\bunable\s+to\s+sponsor\b/i,
    /\bunable\s+to\s+sponsor.*work\s+visas?\b/i,
    /\bdoes\s+not\s+provide\s+(visa\s+)?sponsorship\b/i,
    /\bwill\s+not\s+(?:be\s+)?provid(?:e|ing)\s+(visa\s+)?sponsorship\b/i,
    /\bnot\s+provid(?:e|ing)\s+(visa\s+)?sponsorship\b/i,
    /\bunable\s+to\s+provid(?:e|ing)\s+(visa\s+)?sponsorship\b/i,
    /\bwithout\s+(?:(?:a|the)\s+need\s+for\s+|requiring\s+)?(?:current\s+or\s+)?future\s+(?:visa\s+)?sponsorship\b/i,
    /\bnot\s+sponsoring\b/i,
    /\bsponsorship\s+not\s+available\b/i,
    /\bno\s+visa\s+sponsorship\b/i,
    /\bmust\s+have\s+work\s+authorization\b/i,
    /\bno\s+visa\s+support\b/i,
    /\bwill\s+not\s+sponsor\b/i,
    /\bsponsorship\s+not\s+provided\b/i,
    /\bU\.?S\.?\s+work\s+authorization\s+required\b/i,
    /\bcitizenship\s+required\b/i,
    /\bU\.?S\.?\s+citizenship\s+mandatory\b/i,
    /\bsecurity\s+clearance\s+required\b/i,
    /\bactive\s+security\s+clearance\s+required\b/i,
    /\bactive\s+Top\s+Secret\s+security\s+clearance\b/i,
    /\bactive\s+Top\s+Secret\s+clearance\b/i,
    /\bactive\s+Secret\s+(?:U\.?S\.?\s+)?(?:security\s+)?clearance\b/i,
    /\bTop\s+Secret\s+security\s+clearance\s+required\b/i,
    /\bTop\s+Secret\s+clearance\s+required\b/i,
    /\bSecret\s+security\s+clearance\s+required\b/i,
    /\bSecret\s+clearance\s+required\b/i,
    /\bgovernment\s+security\s+clearance\b/i,
    /\bDOD\s+security\s+clearance\b/i,
    /\bD\.?O\.?D\.?\s+security\s+clearance\b/i,
    /\beligible\s+to\s+obtain\s+(a\s+)?(DOD|D\.?O\.?D\.?|government|security)\s+clearance\b/i,
    /\bmust\s+be\s+eligible\s+for\s+security\s+clearance\b/i,
    /\bmust\s+obtain\s+security\s+clearance\b/i,
    /\bmust\s+have\s+active\s+security\s+clearance\b/i,
    /\bmust\s+possess\s+active\s+security\s+clearance\b/i,
    /\bable\s+to\s+(?:obtain|maintain|obtain\/maintain)\s+(?:an?\s+)?(?:active\s+)?(?:Secret\s+|Top\s+Secret\s+)?(?:U\.?S\.?\s+)?(?:security\s+)?clearance\b/i,
    /\bclearance\s+eligible\b/i,
    /\bsecurity\s+clearance\s+eligible\b/i,
    /\bsecurity\s+clearances?\s+may\s+only\s+be\s+granted\s+to\s+U\.?S\.?\s+citizens?\b/i,
    /\bclearance.*may\s+only\s+be\s+granted\s+to\s+U\.?S\.?\s+citizens?\b/i,
    /\brequires.*government\s+security\s+clearance\b/i,
    /\bmust\s+possess\s+U\.?S\.?\s+citizenship\b/i,
    /\bITAR\s+requirements?\b/i,
    /\bITAR\s+compliance\b/i,
    /\bITAR\s+eligible\b/i,
    /\bmust\s+be\s+ITAR\s+eligible\b/i,
    /\bU\.?S\.?\s+Persons?\s+as\s+defined\s+by\s+ITAR\b/i,
    /\brestricted\s+to\s+U\.?S\.?\s+Persons?\b/i,
    /\bemployment\s+is\s+restricted\s+to\s+U\.?S\.?\s+Persons?\b/i,
    /\b22\s+CFR\s+[§s]?\s*120\b/i,
    /\bU\.?S\.?\s+citizen\s+or\s+national\b/i,
    /\bU\.?S\.?\s+lawful\s+permanent\s+resident\b/i,
    /\bgreen\s+card\s+holder\b/i,
    /\bexport\s+control\s+regulations?\b/i,
    /\bDepartment\s+of\s+State\s+authorization\b/i,
    /\bcandidates\s+(working\s+)?under\s+OPT\b/i,
    /\bworking\s+under\s+OPT\b/i,
    /\bU\.?S\.?\s+citizenship\b/i,
    /\bUnited\s+States\s+citizenship\b/i,
    /\bU\.?S\.?\s+citizens?[^.]{0,40}only\b/i,
    /\bGC\s+holders?\b/i,
    /\bgreen\s+card\s+holders?\s+only\b/i,
    /\bcitizens?\s+or\s+(?:GC|green\s+card)\s+holders?\b/i,
    /\bdo\s+not\s+offer\s+(?:any\s+)?(?:visa\s+)?sponsorship\b/i,
    /\bdoes\s+not\s+offer\s+(?:any\s+)?(?:visa\s+)?sponsorship\b/i,
    /\bnot\s+consider\s+candidates\s+who\s+need\s+sponsorship\b/i,
    /\bwho\s+need\s+sponsorship,?\s+now\s+or\s+in\s+the\s+future\b/i,
    /\bno\s+H[-\s]?1B\b/i,
    /\bno\s+(?:H[-\s]?1B|OPT|CPT)[,\s]/i,
    /\bno\s+(?:OPT|CPT)\b/i,
    /\bH[-\s]?1B,\s*(?:STEM\s+)?OPT\b/i,
    /\bOPT,\s*CPT\b/i,
    /\btemporary\s+work\s+authorization["""]?\s+candidates\s+will\s+not\s+be\s+considered\b/i,
    /\bno\s+C2C\b/i,
    /\bno\s+corp\s*-?\s*to\s*-?\s*corp\b/i,
    /\bor\s+sponsorship\s+for\s+this\s+role\b/i,
    /\bno\s+(?:C2C|corp)[^.]{0,80}sponsorship\b/i
  ];

  const SPONSORSHIP_MODERATE_NEGATIVE = [
    /\bno\s+relocation\s+assistance\b/i,
    /\blocal\s+candidates\s+only\b/i,
    /\bTS\/SCI\b/i,
    /\bTop\s+Secret\/SCI\b/i,
    /\bwilling\s+to\s+obtain\s+(a\s+)?(security\s+)?clearance\b/i,
    /\bclearance\s+is\s+a\s+nice\s+to\s+have\b/i,
    /\bclearance\s+preferred\b/i,
    /\bclearance\s+is\s+preferred\b/i
  ];

  const SPONSORSHIP_NEGATION_PATTERNS = [
    /\bno\s+/i,
    /\bnot\s+/i,
    /\bdoesn't\s+/i,
    /\bdoes\s+not\s+/i,
    /\bcannot\s+/i,
    /\bcan't\s+/i,
    /\bwill\s+not\s+/i,
    /\bwon't\s+/i,
    /\bwithout\s+/i
  ];

  const isSponsorshipNegated = (text, matchIndex) => {
    const contextBefore = text.substring(Math.max(0, matchIndex - 50), matchIndex).toLowerCase();
    for (const negPattern of SPONSORSHIP_NEGATION_PATTERNS) {
      const extended = new RegExp(negPattern.source + "[^.]{0,50}$", "i");
      if (extended.test(contextBefore)) return true;
    }
    return false;
  };

  const findSponsorshipMatches = (pattern, text) => {
    const matches = [];
    const global = pattern.global ? pattern : new RegExp(pattern.source, pattern.flags + "g");
    let m;
    while ((m = global.exec(text)) !== null) {
      matches.push({ text: m[0], index: m.index, length: m[0].length });
    }
    return matches;
  };

  const analyzeSponsorship = (jobDescription) => {
    if (!jobDescription || typeof jobDescription !== "string") {
      return { status: "unclear", confidence: "low", matchedKeywords: [], details: { strongPositive: [], moderatePositive: [], strongNegative: [], moderateNegative: [] } };
    }

    const matched = { strongPositive: [], moderatePositive: [], strongNegative: [], moderateNegative: [] };

    for (const pattern of SPONSORSHIP_STRONG_POSITIVE) {
      for (const m of findSponsorshipMatches(pattern, jobDescription)) {
        if (!isSponsorshipNegated(jobDescription, m.index)) matched.strongPositive.push(m.text);
      }
    }
    for (const pattern of SPONSORSHIP_MODERATE_POSITIVE) {
      for (const m of findSponsorshipMatches(pattern, jobDescription)) {
        if (!isSponsorshipNegated(jobDescription, m.index)) matched.moderatePositive.push(m.text);
      }
    }
    for (const pattern of SPONSORSHIP_STRONG_NEGATIVE) {
      for (const m of findSponsorshipMatches(pattern, jobDescription)) {
        matched.strongNegative.push(m.text);
      }
    }
    for (const pattern of SPONSORSHIP_MODERATE_NEGATIVE) {
      for (const m of findSponsorshipMatches(pattern, jobDescription)) {
        matched.moderateNegative.push(m.text);
      }
    }

    let status, confidence;
    if (matched.strongNegative.length > 0)       { status = "no";  confidence = "high"; }
    else if (matched.strongPositive.length > 0)   { status = "yes"; confidence = "high"; }
    else if (matched.moderatePositive.length > 0) { status = "yes"; confidence = "medium"; }
    else if (matched.moderateNegative.length > 0) { status = "no";  confidence = "medium"; }
    else                                           { status = "yes"; confidence = "low"; }

    const allKeywords = [...new Set([
      ...matched.strongPositive, ...matched.moderatePositive,
      ...matched.strongNegative, ...matched.moderateNegative
    ])];

    return { status, confidence, matchedKeywords: allKeywords, details: matched };
  };

  const extractCompensation = (text) => {
    const normalized = normalizeText(text);

    const parseAmt = (digits, kSuffix) => parseFloat(digits.replace(/,/g, '')) * (kSuffix ? 1000 : 1);
    const fmtAmt = (n) => n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n % 1 === 0 ? n : n.toFixed(2)}`;

    // Range: $X - $Y, $Xk - $Yk, USD X – Y, $X to $Y, MIN $X - MAX $Y
    const rangeRe = /(?:\$|USD\s*\$?|US\$)\s*(\d[\d,]*(?:\.\d+)?)(k?)(?:\s*[-–—]\s*|\s+to\s+)(?:max\s+)?(?:\$|USD\s*\$?|US\$)?\s*(\d[\d,]*(?:\.\d+)?)(k?)(?:\s*(?:\/\s*(?:hr|hour|yr|year)\b|per\s+(?:hour|year)\b|usd\b|annually\b|per\s+annum\b))?/gi;
    let m;
    rangeRe.lastIndex = 0;
    while ((m = rangeRe.exec(normalized)) !== null) {
      let n1 = parseAmt(m[1], m[2]);
      let n2 = parseAmt(m[3], m[4]);
      // Propagate K when one side uses abbreviation and the other omits it
      if (n1 >= 1000 && n2 > 0 && n2 < 500 && !m[4]) n2 *= 1000;
      if (n2 >= 1000 && n1 > 0 && n1 < 500 && !m[2]) n1 *= 1000;
      if (n2 <= n1 || n1 <= 0) continue;
      const isHourly = /\/\s*(?:hr|hour)\b/i.test(m[0]) || (n1 < 500 && n2 < 500);
      const suffix = isHourly ? '/hr' : '';
      return { display: `${fmtAmt(n1)}–${fmtAmt(n2)}${suffix}`, rawMatch: m[0].trim() };
    }

    // Single with explicit hourly/annual suffix: "$45/hr", "$120k annually", "USD 120,000/year"
    const singleRe = /(?:(?:up\s+to|starting\s+at|base(?:\s+salary)?\s+of)\s+)?(?:\$|USD\s*\$?|US\$)\s*(\d[\d,]*(?:\.\d+)?)(k?)(?:\s*(?:\/\s*(?:hr|hour|yr|year)\b|per\s+(?:hour|year)\b|annually\b|per\s+annum\b))/gi;
    singleRe.lastIndex = 0;
    while ((m = singleRe.exec(normalized)) !== null) {
      const n = parseAmt(m[1], m[2]);
      if (n <= 0) continue;
      const isHourly = /\/\s*(?:hr|hour)\b/i.test(m[0]) || (n < 500 && !/(?:yr|year|annual)/i.test(m[0]));
      const prefix = /up\s+to/.test(m[0]) ? '≤' : '';
      const suffix = isHourly ? '/hr' : '';
      return { display: `${prefix}${fmtAmt(n)}${suffix}`, rawMatch: m[0].trim() };
    }

    return null;
  };

  // ---- Language / Framework Detector ----

  // priority: 1=Python, 2=frontend frameworks, 3=TS/Node, 4=other backends
  const LANGUAGE_DEFINITIONS = [
    // ── Frontend frameworks (priority 2; suppress TS/JS/Node chips) ──
    {
      name: "React", priority: 2, frontend: true,
      keywords: [
        { w: "react", weight: 1 }, { w: "react.js", weight: 1 }, { w: "reactjs", weight: 1 },
        { w: "react native", weight: 1 }, { w: "react hooks", weight: 1 },
        { w: "jsx", weight: 0.5 }, { w: "next.js", weight: 1 }, { w: "nextjs", weight: 1 }
      ]
    },
    {
      name: "Vue", priority: 2, frontend: true,
      keywords: [
        { w: "vue", weight: 1 }, { w: "vue.js", weight: 1 },
        { w: "vuex", weight: 1 }, { w: "nuxt", weight: 1 }, { w: "nuxt.js", weight: 1 }
      ]
    },
    {
      name: "Angular", priority: 2, frontend: true,
      keywords: [
        { w: "angular", weight: 1 }, { w: "angularjs", weight: 1 },
        { w: "rxjs", weight: 1 }, { w: "ngrx", weight: 1 }
      ]
    },
    {
      name: "Svelte", priority: 2, frontend: true,
      keywords: [
        { w: "svelte", weight: 1 }, { w: "sveltekit", weight: 1 }
      ]
    },
    // ── Python (priority 1 — user's primary target) ──
    {
      name: "Python", priority: 1,
      keywords: [
        { w: "python", weight: 1 }, { w: "django", weight: 1 }, { w: "flask", weight: 1 },
        { w: "fastapi", weight: 1 }, { w: "numpy", weight: 1 }, { w: "pandas", weight: 1 },
        { w: "pytorch", weight: 1 }, { w: "tensorflow", weight: 1 },
        { w: "scikit-learn", weight: 1 }, { w: "sklearn", weight: 1 },
        { w: "pytest", weight: 1 }, { w: "pydantic", weight: 1 }, { w: "sqlalchemy", weight: 1 },
        { w: "celery", weight: 1 }, { w: "asyncio", weight: 1 }, { w: "pyspark", weight: 1 },
        { w: "langchain", weight: 1 }, { w: "langgraph", weight: 1 }, { w: "llamaindex", weight: 1 }
      ]
    },
    // ── Other backend languages (priority 4) ──
    {
      name: "Java", priority: 4,
      keywords: [
        { w: "\\bjava\\b", weight: 1, isRegex: true, hl: "java" },
        { w: "spring boot", weight: 1 }, { w: "spring framework", weight: 1 },
        { w: "hibernate", weight: 1 }, { w: "maven", weight: 1 },
        { w: "gradle", weight: 1 }, { w: "junit", weight: 1 }, { w: "jvm", weight: 1 }
      ]
    },
    {
      name: "Go", priority: 4, threshold: 3,
      keywords: [
        { w: "golang", weight: 1 }, { w: "go lang", weight: 1 },
        { w: "\\bgo\\b", weight: 0.5, isRegex: true, hl: null }
      ]
    },
    {
      name: "C#", priority: 4,
      keywords: [
        { w: "c#", weight: 1 }, { w: "\\.net\\b", weight: 1, isRegex: true, hl: ".net" },
        { w: "asp.net", weight: 1 }, { w: "dotnet", weight: 1 },
        { w: "entity framework", weight: 1 }, { w: "blazor", weight: 1 }
      ]
    },
    {
      name: "Ruby", priority: 4,
      keywords: [
        { w: "ruby", weight: 1 }, { w: "rails", weight: 1 },
        { w: "ruby on rails", weight: 1 }, { w: "sinatra", weight: 1 }
      ]
    },
    {
      name: "Scala", priority: 4,
      keywords: [{ w: "scala", weight: 1 }, { w: "akka", weight: 1 }]
    },
    {
      name: "Kotlin", priority: 4,
      keywords: [{ w: "kotlin", weight: 1 }]
    },
    {
      name: "Swift", priority: 4,
      keywords: [{ w: "swift", weight: 1 }, { w: "swiftui", weight: 1 }]
    },
    {
      name: "Rust", priority: 4,
      keywords: [{ w: "rust", weight: 1 }]
    },
    {
      name: "C++", priority: 4,
      keywords: [{ w: "c\\+\\+", weight: 1, isRegex: true, hl: "c++" }, { w: "cpp", weight: 1 }]
    },
    {
      name: "PHP", priority: 4,
      keywords: [{ w: "php", weight: 1 }, { w: "laravel", weight: 1 }, { w: "symfony", weight: 1 }]
    },
    // ── Fallback JS/TS (priority 3; suppressed when any frontend framework detected) ──
    {
      name: "TypeScript", priority: 3, suppressedByFrontend: true,
      keywords: [
        { w: "typescript", weight: 1 }, { w: "tsx", weight: 0.5 }, { w: "nestjs", weight: 1 }
      ]
    },
    {
      name: "Node.js", priority: 3, suppressedByFrontend: true,
      keywords: [
        { w: "node\\.js", weight: 1, isRegex: true, hl: "node.js" }, { w: "nodejs", weight: 1 },
        { w: "express", weight: 0.5 }, { w: "expressjs", weight: 1 }
      ]
    },
    {
      name: "JavaScript", priority: 3, suppressedByFrontend: true, suppressedByTS: true,
      keywords: [{ w: "javascript", weight: 1 }]
    }
  ];

  const extractLanguages = (text, title = "") => {
    const normalizedJD = normalizeText(text);
    const normalizedTitle = normalizeText(title);
    const sections = splitIntoSections(normalizedJD);
    const allSections = [{ type: "title", text: normalizedTitle }, ...sections];

    const scored = LANGUAGE_DEFINITIONS.map((lang) => {
      let score = 0;
      const matchedSet = new Set();
      for (const section of allSections) {
        const sw = SECTION_WEIGHTS[section.type] ?? SECTION_WEIGHTS.other;
        for (const kw of lang.keywords) {
          const { w, weight, isRegex, hl } = kw;
          const pattern = isRegex ? new RegExp(w, "gi") : new RegExp(escapeRegex(w), "gi");
          const matches = section.text.match(pattern);
          if (matches) {
            score += matches.length * weight * sw;
            // hl: explicit highlight text; undefined = use w; null = skip
            if (hl !== null) matchedSet.add(hl !== undefined ? hl : w);
          }
        }
      }
      return {
        name: lang.name,
        score,
        priority: lang.priority ?? 4,
        frontend: !!lang.frontend,
        suppressedByFrontend: !!lang.suppressedByFrontend,
        suppressedByTS: !!lang.suppressedByTS,
        threshold: lang.threshold ?? 2,
        matchedKeywords: [...matchedSet]
      };
    });

    const passing = scored.filter(e => e.score >= e.threshold);
    const frontendWins = passing.some(e => e.frontend);
    const tsWins = passing.some(e => e.name === "TypeScript");

    const filtered = passing.filter(e => {
      if (frontendWins && e.suppressedByFrontend) return false;
      if (tsWins && e.suppressedByTS) return false;
      return true;
    });

    // Sort by user-priority ASC first, score DESC second — Python/React always surface over Java
    filtered.sort((a, b) => a.priority !== b.priority ? a.priority - b.priority : b.score - a.score);

    return filtered.slice(0, 2).map(({ name, score, matchedKeywords }) => ({ name, score, matchedKeywords }));
  };

  const root = typeof window !== "undefined" ? window : globalThis;
  root.JobLensClassifier = {
    classifyJobText,
    extractExperienceRequirement,
    extractCompensation,
    analyzeSponsorship,
    extractLanguages
  };
})();
