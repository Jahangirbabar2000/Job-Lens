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

  const EXPERIENCE_PATTERNS = [
    // "8-12+ years"
    {
      re: /(\d+)\s*[-–]\s*(\d+)\+\s*years?/gi,
      parse: (m) => ({ min: parseInt(m[1], 10), display: `${m[1]}–${m[2]}+ yrs` })
    },
    // "3-5 years", "3–5 years"
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
    // "minimum 5 years", "at least 5 years", "at minimum 5 years",
    // "a minimum of 5 years", "no less than 5 years"
    {
      re: /(?:minimum|at\s+(?:least|minimum)|a\s+minimum\s+of|no\s+less\s+than)\s+(\d+)\s*years?/gi,
      parse: (m) => ({ min: parseInt(m[1], 10), display: `${m[1]}+ yrs` })
    },
    // Written words + optional parens: "four (4) years of SWE experience",
    // "five years of experience", "one year of relevant experience"
    {
      re: /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:\(\d+\)\s+)?years?'?\s+of(?:\s+[\w-]+){0,5}\s+experience/gi,
      parse: (m) => {
        const n = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 }[m[1].toLowerCase()];
        return { min: n || 0, display: n === 1 ? "1 yr" : `${n} yrs` };
      }
    },
    // "(4) years of X experience" — parenthetical digit alone
    {
      re: /\((\d+)\)\s+years?'?\s+of(?:\s+[\w-]+){0,5}\s+experience/gi,
      parse: (m) => { const n = parseInt(m[1], 10); return { min: n, display: `${n} yrs` }; }
    },
    // "1 year of software engineering experience", "3 years of experience"
    {
      re: /(\d+)\s+years?'?\s+of(?:\s+[\w-]+){0,5}\s+experience/gi,
      parse: (m) => { const n = parseInt(m[1], 10); return { min: n, display: n === 1 ? "1 yr" : `${n} yrs` }; }
    },
    // "3 years experience", "5 years' experience", "3 years hands-on development experience"
    {
      re: /(\d+)\s+years?'?\s+(?:[\w-]+\s+){0,3}experience/gi,
      parse: (m) => { const n = parseInt(m[1], 10); return { min: n, display: n === 1 ? "1 yr" : `${n} yrs` }; }
    },
    // "5-year experience", "5-year software engineering experience"
    {
      re: /(\d+)-year\s+(?:[\w-]+\s+){0,3}experience/gi,
      parse: (m) => { const n = parseInt(m[1], 10); return { min: n, display: `${n} yrs` }; }
    }
  ];

  const extractExperienceRequirement = (text) => {
    const normalized = normalizeText(text);
    const collected = [];

    for (const { re, parse } of EXPERIENCE_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(normalized)) !== null) {
        const start = m.index;
        const end = m.index + m[0].length;
        const overlaps = collected.some((c) => start < c.end && end > c.start);
        if (!overlaps) {
          const { min, display } = parse(m);
          collected.push({ min, display, rawMatch: m[0], start, end });
        }
      }
    }

    if (!collected.length) return null;
    const best = collected.reduce((b, c) => (c.min > b.min ? c : b));
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
    /\bwill\s+not\s+provide\s+(visa\s+)?sponsorship\b/i,
    /\bnot\s+provide\s+(visa\s+)?sponsorship\b/i,
    /\bunable\s+to\s+provide\s+(visa\s+)?sponsorship\b/i,
    /\bwithout\s+(?:the\s+need\s+for\s+)?(?:current\s+or\s+)?future\s+(?:visa\s+)?sponsorship\b/i,
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
    /\bactive\s+Secret\s+security\s+clearance\b/i,
    /\bactive\s+Secret\s+clearance\b/i,
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
    /\bable\s+to\s+obtain\s+security\s+clearance\b/i,
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
    /\bU\.?S\.?\s+citizen\s+or\s+national\b/i,
    /\bU\.?S\.?\s+lawful\s+permanent\s+resident\b/i,
    /\bgreen\s+card\s+holder\b/i,
    /\bexport\s+control\s+regulations?\b/i,
    /\bDepartment\s+of\s+State\s+authorization\b/i,
    /\bcandidates\s+(working\s+)?under\s+OPT\b/i,
    /\bworking\s+under\s+OPT\b/i,
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
    /\bwon't\s+/i
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

  const root = typeof window !== "undefined" ? window : globalThis;
  root.JobLensClassifier = {
    classifyJobText,
    extractExperienceRequirement,
    analyzeSponsorship
  };
})();
