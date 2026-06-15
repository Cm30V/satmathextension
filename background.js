// background.js — Service Worker
// Pipeline v2: Stage 1 (Vision extraction) → Stage 2 (LaTeX/math cleanup) → Stage 3 (Canonical schema) → Stage 4 (Chat tutor)

import {
  SAT_MATH_CATEGORIES,
  normalizeSatCategory,
  broadTopicFromCategory,
  CATEGORY_PRACTICE_LINKS
} from './satCategories.js';
import {
  repairLatexEscapeDamage,
  normalizeProseSpacing,
  sanitizeLatexClean,
  sanitizeTutorText,
  sanitizeHintText,
  cleanLatex,
  detectLatexIssues,
  repairAnswerChoicesArray,
  formatAnswerChoicesForDisplay,
} from './latexRepair.js';

let session = null;
const DEFAULT_OLLAMA_CONFIG = {
  host: 'http://127.0.0.1:11434',
  visionModel: 'qwen2.5vl:7b',   // Stage 1 — vision extraction
  chatModel: 'qwen2.5:7b'          // Stage 4 — tutor chat (swap to stronger model if available)
};
const OLLAMA_TIMEOUT_MS = 180000;
const SAT_TOPICS = [
  'Algebra',
  'Geometry',
  'Advanced Math',
  'Problem Solving',
  'Data Analysis'
];
const PRACTICE_REMINDER_ALARM = 'satTutorPracticeReminder';
const PLANT_SPECIES = ['fern', 'sunflower', 'oak'];
const TAB_SWITCH_PENALTY = 5;
const SCAN_PLANT_REWARD = 4;
const CHAT_PLANT_REWARD = 3;
const PLANT_GROWTH_ALARM = 'satTutorPlantGrowth';
const PASSIVE_MS_PER_POINT = 30000;

function readPlantHealth(activeSession = session) {
  return Math.max(0, Math.min(100, Math.round(
    activeSession?.plant_health ?? activeSession?.focus_score ?? 0
  )));
}

function syncSessionPlantSpecies(activeSession = session) {
  if (!activeSession) return;
  if (readPlantHealth(activeSession) >= 67 && !activeSession.plant_species) {
    activeSession.plant_species = PLANT_SPECIES[Math.floor(Math.random() * PLANT_SPECIES.length)];
  }
}

function applyTabSwitchPenalty() {
  if (!session) return;
  session.plant_health = Math.max(0, readPlantHealth() - TAB_SWITCH_PENALTY);
  session.focus_score = session.plant_health;
}

function boostPlantHealth(amount) {
  if (!session) return;
  session.plant_health = Math.min(100, readPlantHealth() + amount);
  session.focus_score = session.plant_health;
  syncSessionPlantSpecies();
}

function clearPlantGrowthAlarm() {
  chrome.alarms.clear(PLANT_GROWTH_ALARM);
}

function schedulePlantGrowthAlarm() {
  if (!session?.active || readPlantHealth() >= 100) {
    clearPlantGrowthAlarm();
    return;
  }
  chrome.alarms.create(PLANT_GROWTH_ALARM, { when: Date.now() + PASSIVE_MS_PER_POINT });
}

function applyPassivePlantGrowth(broadcast = true) {
  if (!session?.active) return 0;
  if (readPlantHealth() >= 100) {
    clearPlantGrowthAlarm();
    return 0;
  }

  const now = Date.now();
  const last = session.plant_last_tick ?? session.start_time ?? now;
  const points = Math.floor((now - last) / PASSIVE_MS_PER_POINT);
  if (points <= 0) return 0;

  boostPlantHealth(points);
  session.plant_last_tick = last + points * PASSIVE_MS_PER_POINT;
  persistSession();

  if (broadcast) {
    broadcastToSidebar({ type: 'SESSION_UPDATE', session });
  }

  if (readPlantHealth() >= 100) {
    clearPlantGrowthAlarm();
  }

  return points;
}

// ─── Session Helpers ──────────────────────────────────────────────
function createSession(duration, categories) {
  return {
    id: crypto.randomUUID(),
    start_time: Date.now(),
    end_time: null,
    duration_min: duration,
    active: true,
    categories: categories,
    plant_health: 0,
    plant_species: null,
    plant_last_tick: Date.now(),
    focus_score: 0,
    tab_switches: 0,
    scan_count: 0,
    questions: [],
    category_map: {},
    skill_map: Object.fromEntries(SAT_TOPICS.map(topic => [topic, 0.5]))
  };
}

function recordCategoryScan(category, difficulty = 'Medium') {
  if (!session?.active || !category) return;

  const cat = normalizeSatCategory(category);
  if (!session.category_map) session.category_map = {};
  if (!session.category_map[cat]) {
    session.category_map[cat] = { score: 0.45, scans: 0, difficulty };
  }

  session.category_map[cat].scans += 1;
  session.category_map[cat].score = Math.min(1, session.category_map[cat].score + 0.05);

  const broad = broadTopicFromCategory(cat);
  const topicScore = session.skill_map[broad] ?? 0.5;
  session.skill_map[broad] = Math.min(1, topicScore + 0.05);
}

function adjustCategorySkill(category, delta) {
  if (!session?.active || !category) return;

  const cat = normalizeSatCategory(category);
  if (!session.category_map?.[cat]) return;
  session.category_map[cat].score = Math.max(0, Math.min(1, session.category_map[cat].score + delta));
}

function persistSession() {
  chrome.storage.local.set({ activeSession: session });
}

function sendTabMessageSafely(tabId, msg) {
  try {
    const result = chrome.tabs.sendMessage(tabId, msg);
    if (result?.catch) result.catch(() => {});
  } catch {
    // Best-effort UI status messages — ignore failures
  }
}

function broadcastToSidebar(msg) {
  try {
    const result = chrome.runtime.sendMessage(msg);
    if (result?.catch) result.catch(() => {});
  } catch {
    // No sidebar or popup listening — ignore
  }
}

function expireSessionIfNeeded() {
  if (!session?.active) return false;
  const expiresAt = session.start_time + (session.duration_min * 60000);
  if (Date.now() < expiresAt) return false;

  session.active = false;
  session.end_time = expiresAt;
  persistSession();
  broadcastToSidebar({ type: 'SESSION_ENDED', session, summary: generateSummaryData() });
  return true;
}

// ─── Tab switch tracking ──────────────────────────────────────────
chrome.tabs.onActivated.addListener(() => {
  if (!session || !session.active) return;
  if (expireSessionIfNeeded()) return;
  session.tab_switches++;
  applyTabSwitchPenalty();
  persistSession();
  broadcastToSidebar({ type: 'SESSION_UPDATE', session });
});

// ─── Ollama Config ────────────────────────────────────────────────
function normalizeOllamaHost(host) {
  const trimmed = String(host || DEFAULT_OLLAMA_CONFIG.host).trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function normalizeVisionModel(model) {
  const trimmed = String(model || '').trim();
  return trimmed || DEFAULT_OLLAMA_CONFIG.visionModel;
}

async function getOllamaConfig() {
  const stored = await new Promise(resolve => {
    chrome.storage.local.get(['ollamaHost', 'ollamaVisionModel', 'ollamaChatModel'], resolve);
  });
  return {
    host: normalizeOllamaHost(stored.ollamaHost),
    visionModel: normalizeVisionModel(stored.ollamaVisionModel),
    chatModel: String(stored.ollamaChatModel || DEFAULT_OLLAMA_CONFIG.chatModel).trim()
  };
}

// ─── Ollama HTTP Primitives ───────────────────────────────────────
async function fetchOllama(path, bodyFn) {
  const config = await getOllamaConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const res = await fetch(`${config.host}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyFn(config)),
      signal: controller.signal
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama ${path} error ${res.status}: ${err}`);
    }

    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Ollama request timed out after ${Math.round(OLLAMA_TIMEOUT_MS / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getFriendlyOllamaError(err) {
  const message = err?.message || String(err);
  if (/unknown model architecture/i.test(message)) {
    return `${message}. Your Ollama runtime cannot load this model architecture. Update Ollama, restart the server, then try again.`;
  }
  if (/Failed to fetch|Load failed|NetworkError|ECONNREFUSED|could not connect/i.test(message)) {
    return `${message}. Ollama is not reachable at the configured host. Start Ollama and confirm the host URL.`;
  }
  if (/JSON|Unterminated string|Unexpected token|Expected property name/i.test(message)) {
    return message;
  }
  return `${message}. Verify Ollama is running and the configured models are pulled.`;
}

function escapeJsonStringControlChars(jsonText) {
  let out = '';
  let inString = false;
  let escaped = false;

  for (const char of String(jsonText || '')) {
    if (!inString) {
      out += char;
      if (char === '"') inString = true;
      continue;
    }

    if (escaped) {
      out += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      out += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      out += char;
      inString = false;
      continue;
    }

    if (char === '\n') {
      out += '\\n';
    } else if (char === '\r') {
      out += '\\r';
    } else if (char === '\t') {
      out += '\\t';
    } else {
      out += char;
    }
  }

  return out;
}

function repairJsonStringEscapes(jsonText) {
  let out = '';
  let inString = false;
  let escaped = false;

  for (const char of String(jsonText || '')) {
    if (!inString) {
      out += char;
      if (char === '"') inString = true;
      continue;
    }

    if (escaped) {
      out += /["\\/bfnrtu]/.test(char) ? char : `\\${char}`;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      out += char;
      escaped = true;
      continue;
    }

    out += char;
    if (char === '"') inString = false;
  }

  return out;
}

function tryParseJsonObject(jsonText) {
  const parsed = JSON.parse(jsonText);
  return repairLatexEscapeDamage(parsed);
}

/**
 * Attempts to close a truncated JSON string by:
 *   1. Detecting whether we are mid-string (inString) and appending a closing `"`.
 *   2. Stripping any trailing incomplete key or value after the last well-formed comma/brace.
 *   3. Appending as many `}` / `]` as are needed to match unclosed openers.
 *
 * This lets a response that was cut off mid-"solution" still be parsed with all
 * earlier fields intact (solution will be truncated but not missing entirely).
 */
function repairTruncatedJson(jsonText) {
  let s = String(jsonText || '').trim();
  if (!s) return s;

  // Walk the string tracking parser state
  let inString = false;
  let escaped = false;
  const stack = []; // tracks '{' and '[' openers

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (inString) {
      if (c === '\\') { escaped = true; continue; }
      if (c === '"') { inString = false; }
      continue;
    }

    // Not in string
    if (c === '"') { inString = true; continue; }
    if (c === '{' || c === '[') { stack.push(c); continue; }
    if (c === '}' || c === ']') { stack.pop(); }
  }

  // Close any open string
  if (inString) {
    // Remove trailing incomplete token after the last comma or opening brace/bracket,
    // so we don't leave half-written keys or values dangling.
    const lastSafe = Math.max(s.lastIndexOf(','), s.lastIndexOf('{'), s.lastIndexOf('['));
    if (lastSafe !== -1) {
      s = s.slice(0, lastSafe);
    }
  }

  // Close any unclosed arrays/objects (stack items in reverse)
  for (let i = stack.length - 1; i >= 0; i--) {
    s += stack[i] === '[' ? ']' : '}';
  }

  return s;
}

function parseJsonObject(text) {
  const clean = String(text || '').replace(/```json|```/g, '').trim();
  const candidates = [clean];

  const first = clean.indexOf('{');
  const last = clean.lastIndexOf('}');
  if (first !== -1 && last > first) {
    candidates.push(clean.slice(first, last + 1));
  }

  const repairedCandidates = candidates.map(escapeJsonStringControlChars);
  const escapeRepairedCandidates = [...candidates, ...repairedCandidates].map(repairJsonStringEscapes);
  const allCandidates = [...candidates, ...repairedCandidates, ...escapeRepairedCandidates];
  let lastError = null;

  for (const candidate of allCandidates) {
    if (!candidate) continue;
    try {
      return tryParseJsonObject(candidate);
    } catch (err) {
      lastError = err;
    }
  }

  const message = lastError?.message || 'Ollama returned non-JSON output';

  // Truncation recovery: try to close dangling strings/braces before giving up
  if (/Unterminated string|Unexpected end of JSON/i.test(message)) {
    const truncationCandidates = allCandidates.map(c => {
      try { return repairTruncatedJson(c); } catch { return null; }
    }).filter(Boolean);

    for (const candidate of truncationCandidates) {
      try {
        return tryParseJsonObject(candidate);
      } catch {
        // keep trying
      }
    }

    // Fell through — still broken, but give a friendlier message
    throw new Error('Ollama returned incomplete JSON, likely because the response was truncated while writing a long solution. Try rescanning, or use a smaller capture region around just the problem.');
  }

  try {
    return tryParseJsonObject(clean);
  } catch {
    throw new Error(`Ollama returned malformed JSON: ${message}`);
  }
}

function showPracticeReminderNotification(reminder) {
  chrome.notifications.create('satTutorPracticeReminderNotification', {
    type: 'basic',
    iconUrl: 'icons/reminder.svg',
    title: 'SAT practice reminder',
    message: reminder?.message || 'Time to practice SAT math again.',
    priority: 2
  });
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === PLANT_GROWTH_ALARM) {
    applyPassivePlantGrowth(true);
    schedulePlantGrowthAlarm();
    return;
  }

  if (alarm.name !== PRACTICE_REMINDER_ALARM) return;
  chrome.storage.local.get('practiceReminder', ({ practiceReminder }) => {
    showPracticeReminderNotification(practiceReminder);
    chrome.storage.local.remove('practiceReminder');
  });
});

chrome.notifications.onClicked.addListener(notificationId => {
  if (notificationId !== 'satTutorPracticeReminderNotification') return;
  chrome.notifications.clear(notificationId);
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.windowId) {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// STAGE 1 — Vision Extraction (Qwen2.5-VL / llama3.2-vision)
// Goal: pure OCR extraction, no solving, strict JSON
// ═══════════════════════════════════════════════════════════════════

const VISION_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    raw_text:       { type: 'string' },
    latex:          { type: 'string' },
    answer_choices: { type: 'array', items: { type: 'string' } },
    diagram_notes:  { type: 'string' },
    confidence:     { type: 'number', minimum: 0, maximum: 1 }
  },
  required: ['raw_text', 'latex', 'answer_choices', 'diagram_notes', 'confidence']
};

function buildVisionExtractionPrompt(selectedText = '') {
  const selBlock = selectedText
    ? `\nThe user also had this page text selected. Prefer it over OCR only if it directly matches the image:\n"""${String(selectedText).slice(0, 3000)}"""\n`
    : '';

  return `Extract the math or reading problem from this image.${selBlock}

Return STRICT JSON — no markdown, no backticks, no preamble:
{
  "raw_text": "Complete visible question text with NORMAL SPACES between words and punctuation. Use [unclear] for any unreadable character.",
  "latex": "ONLY standalone equations or expressions in LaTeX (e.g. V(x)=9x(x-7), \\\\triangle CAE \\\\sim \\\\triangle CBD). Empty string if the problem is a word problem with no separate equation line.",
  "answer_choices": [],
  "diagram_notes": "For geometry: list labeled points, segments, angles with measures, similarity marks, and right-angle markers ONLY if clearly shown. Do not invent shapes or angles. Empty string if none.",
  "confidence": 0.0
}

Rules:
- raw_text must read like normal English — never concatenate words (write "A right rectangular prism", not "Arightrectangularprism").
- Put the full question sentence in raw_text only. Do NOT duplicate the question prose inside latex.
- latex is for math expressions only: formulas, functions like V(x), geometry relations, labeled equations. Not full sentences.
- Preserve ALL numbers, signs, exponents, and operators EXACTLY as visible.
- For tables, extract the visible row/column labels and cell values into raw_text or diagram_notes. If any required table value is not visible, mark it [unclear].
- For multiple-choice, copy each choice exactly. Do not combine numbers from the question into a choice (e.g. do not write 26·57° unless that is literally printed).
- For similar triangles, note which triangles are similar and which angles correspond. Do not guess segment ratios like AE=26(BD) unless clearly labeled.
- If no answer choices are visible, return an empty answer_choices array. Never invent placeholder choices like "A) ...".
- If an answer choice is partially unreadable, write the letter followed by [unclear], e.g. "C) [unclear]".
- Do NOT solve the problem. Do NOT invent missing values.
- Set confidence below 0.7 whenever any important value, symbol, diagram label, or answer choice is uncertain.
- If the image is not a question, set raw_text to "Not a question." and confidence to 0.1.`;
}

async function runVisionExtraction(imageBase64, selectedText) {
  const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

  const data = await fetchOllama('/api/generate', ({ visionModel }) => ({
    model: visionModel,
    prompt: buildVisionExtractionPrompt(selectedText),
    images: [base64Data],
    stream: false,
    format: VISION_EXTRACTION_SCHEMA,
    options: {
      temperature: 0,
      top_p: 0.1,
      repeat_penalty: 1.05,
      num_ctx: 8192,
      num_predict: 800
    }
  }));

  const text = data?.response;
  if (!text) throw new Error('Empty response from vision model during extraction');
  return parseJsonObject(text);
}

// ═══════════════════════════════════════════════════════════════════
// STAGE 2 — LaTeX / Math Cleanup Layer
// Goal: fix broken LaTeX, normalize operators, validate balance
// This runs in-process (no model call) using deterministic regex rules
// ═══════════════════════════════════════════════════════════════════

function cleanAnswerChoices(choices) {
  if (!Array.isArray(choices)) return [];
  return choices
    .filter(c => c && typeof c === 'string')
    .map(c => c.trim())
    .filter(c => !/^[A-F]\)\s*(?:\.{3}|…)$/i.test(c))
    .filter(c => c.length > 0)
    .slice(0, 6); // SAT max 4 regular + 2 for grid-in edge cases
}

function applyCleanupLayer(extracted) {
  const rawText        = normalizeProseSpacing(String(extracted.raw_text || '').trim());
  const cleanedLatex   = sanitizeLatexClean(extracted.latex || '', rawText);
  const latexIssues    = detectLatexIssues(cleanedLatex);
  const answerChoices  = cleanAnswerChoices(extracted.answer_choices);
  const diagramNotes   = String(extracted.diagram_notes || '').trim();
  const confidence     = Number.isFinite(Number(extracted.confidence))
    ? Math.max(0, Math.min(1, Number(extracted.confidence)))
    : 0.5;

  // Downgrade confidence if cleanup found issues
  const adjustedConfidence = latexIssues.length > 0
    ? Math.min(confidence, 0.65)
    : confidence;

  return {
    raw_text:        rawText || 'Question text not detected.',
    latex:           cleanedLatex,
    latex_issues:    latexIssues,
    answer_choices:  answerChoices,
    diagram_notes:   diagramNotes,
    confidence:      adjustedConfidence
  };
}

// ═══════════════════════════════════════════════════════════════════
// STAGE 3 — Problem Structuring (Canonical Schema)
// Goal: classify problem_type, extract given/goal/constraints
//       so Stage 4 tutor receives a rich, unambiguous context
// ═══════════════════════════════════════════════════════════════════

const CANONICAL_SCHEMA = {
  type: 'object',
  properties: {
    question_text: { type: 'string' },
    sat_category:  { type: 'string', enum: SAT_MATH_CATEGORIES },
    topic:         { type: 'string', enum: SAT_TOPICS },
    difficulty:    { type: 'string', enum: ['Easy', 'Medium', 'Hard'] },
    problem_type:  { type: 'string' },
    given:         { type: 'array', items: { type: 'string' } },
    goal:          { type: 'string' },
    constraints:   { type: 'string' },
    latex_clean:   { type: 'string' },
    answer_choices:{ type: 'array', items: { type: 'string' } },
    hints:         { type: 'array', minItems: 3, maxItems: 5, items: { type: 'string' } },
    strategy:      { type: 'string' },
    solution:      { type: 'string' },
    confidence:    { type: 'number', minimum: 0, maximum: 1 },
    unreadable_parts: { type: 'array', items: { type: 'string' } }
  },
  required: [
    'question_text','sat_category','topic','difficulty','problem_type',
    'given','goal','constraints','latex_clean','answer_choices',
    'hints','strategy','solution','confidence','unreadable_parts'
  ]
};

function buildStructuringPrompt(cleaned, selectedText = '') {
  const selBlock = selectedText
    ? `\nAdditional selected text from user:\n"""${String(selectedText).slice(0, 1500)}"""\n`
    : '';

  const latexWarning = cleaned.latex_issues.length > 0
    ? `\nWARNING: The LaTeX has detected issues: ${cleaned.latex_issues.join(', ')}. Use the raw_text as the authoritative source for any equation values.\n`
    : '';

  const answerBlock = cleaned.answer_choices.length > 0
    ? `Answer choices already extracted: ${JSON.stringify(cleaned.answer_choices)}`
    : 'No answer choices detected — this may be a grid-in question.';

  return `You are an expert SAT tutor. A vision model already extracted the raw text and LaTeX from a screenshot.
Your job is to structure this into a canonical problem schema for tutoring.${selBlock}${latexWarning}

=== EXTRACTED DATA ===
Raw text: ${cleaned.raw_text}
LaTeX: ${cleaned.latex || '(none)'}
${answerBlock}
Diagram notes: ${cleaned.diagram_notes || '(none)'}
Extraction confidence: ${Math.round(cleaned.confidence * 100)}%

=== YOUR TASK ===
Analyze the extracted data and return STRICT JSON — no markdown, no backticks, no preamble:
{
  "question_text": "Clean, readable version of the full question with normal spaces between words. Preserve all numbers exactly. Use [unclear] only for genuinely unreadable parts.",
  "sat_category": "EXACTLY one of these Digital SAT Math categories: ${SAT_MATH_CATEGORIES.join(' | ')}",
  "topic": "Broad bucket — one of: Algebra|Geometry|Advanced Math|Problem Solving|Reading|Writing|Data Analysis",
  "difficulty": "Easy|Medium|Hard",
  "problem_type": "e.g. quadratic equation | linear system | geometry proof | reading inference | grammar | statistics",
  "given": ["Each piece of given information as a separate string"],
  "goal": "Exactly what the question is asking to find or determine",
  "constraints": "Any stated constraints, domain restrictions, or conditions (empty string if none)",
  "latex_clean": "ONLY core math expressions (e.g. V(x)=9x(x-7) or \\\\angle CBD = 57^\\\\circ). Empty string for word problems with no standalone equation. NEVER put the full question sentence here.",
  "answer_choices": [],
  "hints": [
    "Hint 1: guide toward the right approach without solving",
    "Hint 2: more specific nudge",
    "Hint 3: nearly there — point at the key step"
  ],
  "strategy": "A concise SAT test-taking strategy for this problem type (time management, elimination, substitution, etc.)",
  "solution": "Full step-by-step solution with math justification at each step.",
  "confidence": 0.0,
  "unreadable_parts": ["list any parts still unclear after extraction, or empty array"]
}

Rules:
- Do NOT invent values not visible in the raw_text or LaTeX.
- For table probability questions, do not invent counts. If the table values needed to answer are absent or unreadable, say which value is missing in unreadable_parts and make the solution explain that the problem must be rescanned.
- Keep all numbers exactly as extracted. If unsure, copy from raw_text rather than the LaTeX.
- question_text must be normal English with spaces — never run words together.
- latex_clean must be empty unless there is a real standalone formula. Word problems usually have latex_clean = "".
- For geometry, use diagram_notes and given for figure facts; do not invent right angles or extra shapes.
- answer_choices must contain only choices that are visible in the extracted data. If none are visible, return [].
- hints must build progressively — each one closer to the answer, never giving it away early.
- solution must show every algebraic or logical step, not just the final answer.
- If the image does not contain an SAT question, set question_text to "Not a valid SAT question." and confidence to 0.1.

LATEX FORMATTING (applies to question_text, given, goal, hints, strategy, and solution):
- Wrap every math expression in LaTeX delimiters: use \\( ... \\) for inline math and \\[ ... \\] for an equation on its own line. Never use bare ( ... ) or [ ... ] for math.
- Use real LaTeX commands with backslashes: \\pi, \\text, \\times, \\frac{a}{b}, \\leq, \\sqrt{x}, x^{2}, r_{A}, h_{A}. Never write \\tpi, \\theight, \\tradius, or \\t\\text{...}.
- For cylinders use \\(V=\\pi r^{2}h\\). Use r for radius, h for height, and \\pi — not \\text{pi}, \\text{radius}, or \\text{height}.
- Do not nest broken commands like \\text{base\\) \\(area}. Write \\pi r^{2} or \\text{base area} instead.
- If a system has multiple equations/inequalities, write each one in its own \\[ ... \\] block rather than combining them with \\\\ line breaks.
- "latex_clean" should contain ONLY the raw LaTeX expression(s) with no surrounding delimiters and no prose — the UI adds delimiters automatically.`;
}

async function runStructuringStage(cleaned, selectedText) {
  const data = await fetchOllama('/api/generate', ({ chatModel }) => ({
    model: chatModel,
    prompt: buildStructuringPrompt(cleaned, selectedText),
    stream: false,
    format: CANONICAL_SCHEMA,
    options: {
      temperature: 0,
      top_p: 0.15,
      repeat_penalty: 1.05,
      num_ctx: 8192,
      num_predict: 6000
    }
  }));

  const text = data?.response;
  if (!text) throw new Error('Empty response from structuring stage');
  return parseJsonObject(text);
}

// ═══════════════════════════════════════════════════════════════════
// STAGE 4 — Tutor Chat (separate model call)
// Goal: respond to student chat with targeted tutoring
//       context includes the full canonical schema from Stage 3
// ═══════════════════════════════════════════════════════════════════

async function callOllamaChat(messages, currentQuestion) {
  let systemContext;

  if (currentQuestion) {
    const choicesBlock = Array.isArray(currentQuestion.answer_choices) && currentQuestion.answer_choices.length > 0
      ? `\nAnswer choices: ${currentQuestion.answer_choices.join(' | ')}`
      : '';

    const givenBlock = Array.isArray(currentQuestion.given) && currentQuestion.given.length > 0
      ? `\nGiven: ${currentQuestion.given.join('; ')}`
      : '';

    const latexBlock = currentQuestion.latex_clean
      ? `\nKey equations (LaTeX): ${currentQuestion.latex_clean}`
      : '';

    systemContext = `You are an expert SAT tutor helping a student with a ${currentQuestion.difficulty || 'Medium'} difficulty ${currentQuestion.sat_category || currentQuestion.topic || 'Math'} question.

PROBLEM CONTEXT:
SAT category: ${currentQuestion.sat_category || currentQuestion.topic || 'Unknown'}
Question: ${currentQuestion.question_text || '(see previous messages)'}${givenBlock}
Goal: ${currentQuestion.goal || ''}
Problem type: ${currentQuestion.problem_type || ''}${latexBlock}${choicesBlock}

TUTORING RULES:
- Give targeted help for THIS specific problem.
- In hint mode: give ONE next step at a time. Do NOT solve fully unless the student has seen all hints.
- In explanation mode: show every algebraic or logical step with justification.
- If the student asks a guiding question, respond with a guiding question back to Socratically prompt their thinking.
- Keep responses concise but complete.
- Do not use Markdown bold markers, heading markers, or tables. Avoid **text**, __text__, and ### headings.
- Do not write exponents as stacked plain text. Use LaTeX, such as \\(3x^{2} - 18x + 20\\).

LATEX FORMATTING:
- Wrap every math expression in LaTeX delimiters: \\( ... \\) for inline math, \\[ ... \\] for an equation on its own line. Never use bare ( ... ) or [ ... ] for math, and never leave LaTeX commands (\\leq, \\frac, etc.) outside delimiters.
- Write each equation or inequality in its own \\[ ... \\] block instead of joining several with \\\\ line breaks.
- Use real LaTeX commands for symbols: \\leq, \\geq, \\neq, \\times, \\div, \\pm, \\cdot, \\frac{a}{b}, \\sqrt{x}, x^{2}, x_{1}.`;
  } else {
    systemContext = 'You are an expert SAT tutor. Help the student with their SAT preparation. Be concise and targeted. Do not use Markdown bold markers, heading markers, or tables. Avoid **text**, __text__, and ### headings. Wrap any math in \\( ... \\) for inline expressions or \\[ ... \\] for standalone equations, using real LaTeX commands (\\leq, \\frac{a}{b}, \\sqrt{x}, x^{2}, etc.) — never bare parentheses/brackets, stacked plain-text exponents, or un-delimited LaTeX commands.';
  }

  const formattedMessages = [
    { role: 'system', content: systemContext },
    ...messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }))
  ];

  const data = await fetchOllama('/api/chat', ({ chatModel }) => ({
    model: chatModel,
    messages: formattedMessages,
    stream: false,
    options: {
      temperature: 0.3,
      top_p: 0.5,
      num_ctx: 8192
    }
  }));

  const text = data?.message?.content;
  if (!text) throw new Error('Empty response from tutor chat');
  return sanitizeTutorText(text);
}

// ═══════════════════════════════════════════════════════════════════
// PIPELINE ORCHESTRATOR
// Runs Stage 1 → Stage 2 → Stage 3, returns validated canonical data
// ═══════════════════════════════════════════════════════════════════

async function runFullPipeline(imageBase64, selectedText) {
  // Stage 1: Vision extraction
  broadcastToSidebar({ type: 'PIPELINE_STAGE', stage: 1, label: 'Extracting text & equations...' });
  const extracted = await runVisionExtraction(imageBase64, selectedText);

  // Stage 2: Deterministic cleanup (no model call)
  broadcastToSidebar({ type: 'PIPELINE_STAGE', stage: 2, label: 'Cleaning LaTeX...' });
  const cleaned = applyCleanupLayer(extracted);

  // Stage 3: Problem structuring via chat model
  broadcastToSidebar({ type: 'PIPELINE_STAGE', stage: 3, label: 'Structuring problem...' });
  const canonical = await runStructuringStage(cleaned, selectedText);

  return validateCanonical(canonical, cleaned);
}

function validateCanonical(data, cleaned) {
  if (!data || typeof data !== 'object') {
    throw new Error('Structuring stage returned non-object');
  }

  const satCategory = normalizeSatCategory(data.sat_category || data.topic);
  const topic = SAT_TOPICS.includes(data.topic)
    ? data.topic
    : broadTopicFromCategory(satCategory);
  const difficulty = ['Easy', 'Medium', 'Hard'].includes(data.difficulty) ? data.difficulty : 'Medium';
  const confidence = Number.isFinite(Number(data.confidence))
    ? Math.max(0, Math.min(1, Number(data.confidence)))
    : cleaned.confidence;

  const hints = Array.isArray(data.hints)
    ? data.hints.filter(Boolean).map(h => sanitizeHintText(h)).slice(0, 5)
    : [];
  const given = Array.isArray(data.given)
    ? data.given.filter(Boolean).map(g => sanitizeTutorText(g))
    : [];
  const answerChoices = Array.isArray(data.answer_choices) && data.answer_choices.length > 0
    ? repairAnswerChoicesArray(data.answer_choices.filter(Boolean).map(c => sanitizeTutorText(c)))
    : repairAnswerChoicesArray(cleaned.answer_choices);
  const unreadableParts = Array.isArray(data.unreadable_parts)
    ? data.unreadable_parts.filter(Boolean).map(String).slice(0, 8)
    : [];

  const questionText = sanitizeTutorText(data.question_text || cleaned.raw_text || 'Question not detected.');
  const latexClean = sanitizeLatexClean(data.latex_clean || cleaned.latex || '', questionText);

  return {
    question_text:  questionText,
    sat_category:   satCategory,
    topic,
    difficulty,
    problem_type:   String(data.problem_type || '').trim(),
    given,
    goal:           sanitizeTutorText(data.goal || ''),
    constraints:    sanitizeTutorText(data.constraints || ''),
    latex_clean:    latexClean,
    answer_choices: answerChoices,
    hints:          hints.length ? hints : ['Identify what is given and what is being asked.'],
    strategy:       sanitizeTutorText(data.strategy || '') || 'Read carefully, identify knowns, eliminate wrong answer choices.',
    solution:       sanitizeTutorText(data.solution || '') || 'The model did not produce a complete solution. Try rescanning a cleaner region.',
    confidence,
    unreadable_parts: unreadableParts,
    // Pass-through for sidebar display
    diagram_notes:  cleaned.diagram_notes,
    latex_issues:   cleaned.latex_issues
  };
}

// ─── Main Message Routing ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {

    case 'START_SESSION': {
      session = createSession(msg.duration, msg.categories);
      schedulePlantGrowthAlarm();
      persistSession();
      broadcastToSidebar({ type: 'SESSION_UPDATE', session });
      sendResponse({ ok: true });
      break;
    }

    case 'GET_SESSION': {
      expireSessionIfNeeded();
      applyPassivePlantGrowth(true);
      sendResponse(session);
      break;
    }

    case 'END_SESSION': {
      if (session) {
        session.active = false;
        session.end_time = Date.now();
        clearPlantGrowthAlarm();
        persistSession();
        const summary = generateSummaryData();
        broadcastToSidebar({ type: 'SESSION_ENDED', session, summary });
      }
      sendResponse({ ok: true });
      break;
    }

    case 'OPEN_SIDEBAR': {
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab?.windowId) {
          chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
        }
      });
      sendResponse({ ok: true });
      break;
    }

    case 'SET_PRACTICE_REMINDER': {
      const reminder = msg.reminder || {};
      const when = Number(reminder.when);
      if (!reminder.message || !Number.isFinite(when) || when <= Date.now()) {
        sendResponse({ ok: false, error: 'Reminder needs a future time and message.' });
        break;
      }
      chrome.storage.local.set({ practiceReminder: { ...reminder, when } }, () => {
        chrome.alarms.clear(PRACTICE_REMINDER_ALARM, () => {
          chrome.alarms.create(PRACTICE_REMINDER_ALARM, { when });
          sendResponse({ ok: true });
        });
      });
      return true;
    }

    case 'CLEAR_PRACTICE_REMINDER': {
      chrome.alarms.clear(PRACTICE_REMINDER_ALARM, () => {
        chrome.storage.local.remove('practiceReminder', () => sendResponse({ ok: true }));
      });
      return true;
    }

    case 'CAPTURE_QUESTION': {
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab) {
          sendResponse({ ok: false, error: 'No active tab found.' });
          return;
        }
        chrome.tabs.sendMessage(tab.id, { type: 'PING' }, (pingRes) => {
          const doCapture = () => {
            chrome.tabs.sendMessage(tab.id, { type: 'START_REGION_CAPTURE' }, (res) => {
              if (chrome.runtime.lastError || !res) {
                broadcastToSidebar({ type: 'CAPTURE_ERROR', error: 'Content script did not respond.' });
                sendResponse({ ok: false, error: 'Content script did not respond.' });
                return;
              }
              if (!res.ok) {
                broadcastToSidebar({ type: 'CAPTURE_ERROR', error: res.error });
                sendResponse({ ok: false, error: res.error });
                return;
              }

              broadcastToSidebar({ type: 'CAPTURE_ANALYZING', stage: 'vision' });
              sendTabMessageSafely(tab.id, { type: 'CAPTURE_ANALYZING' });

              (async () => {
                try {
                  // ── Run full 3-stage pipeline (broadcasts PIPELINE_STAGE 1,2,3 internally) ──
                  const questionData = await runFullPipeline(res.dataUrl, res.selectedText || '');

                  if (session && session.active) {
                    session.scan_count++;
                    boostPlantHealth(SCAN_PLANT_REWARD);
                    recordCategoryScan(questionData.sat_category, questionData.difficulty);
                    session.questions.push({
                      text:            questionData.question_text,
                      sat_category:    questionData.sat_category,
                      topic:           questionData.topic,
                      difficulty:      questionData.difficulty,
                      problem_type:    questionData.problem_type,
                      given:           questionData.given,
                      goal:            questionData.goal,
                      constraints:     questionData.constraints,
                      latex_clean:     questionData.latex_clean,
                      answer_choices:  questionData.answer_choices,
                      hints:           questionData.hints,
                      strategy:        questionData.strategy,
                      solution:        questionData.solution,
                      confidence:      questionData.confidence,
                      unreadable_parts:questionData.unreadable_parts,
                      timestamp:       Date.now()
                    });
                    persistSession();
                    broadcastToSidebar({ type: 'SESSION_UPDATE', session });
                  }

                  sendTabMessageSafely(tab.id, { type: 'CAPTURE_DONE' });
                  broadcastToSidebar({ type: 'QUESTION_READY', data: questionData });
                  sendResponse({ ok: true });

                } catch (err) {
                  console.error('Pipeline error:', err);
                  const errMsg = `Analysis failed: ${getFriendlyOllamaError(err)}`;
                  sendTabMessageSafely(tab.id, { type: 'CAPTURE_ERROR' });
                  broadcastToSidebar({ type: 'CAPTURE_ERROR', error: errMsg });
                  sendResponse({ ok: false, error: errMsg });
                }
              })();
            });
          };

          if (chrome.runtime.lastError || !pingRes) {
            chrome.scripting.executeScript(
              { target: { tabId: tab.id }, files: ['content.js'] },
              () => {
                if (chrome.runtime.lastError) {
                  sendResponse({ ok: false, error: 'Cannot inject into this page.' });
                  return;
                }
                setTimeout(doCapture, 150);
              }
            );
          } else {
            doCapture();
          }
        });
      });
      return true;
    }

    case 'GET_TAB_STREAM': {
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          sendResponse({ ok: false, error: chrome.runtime.lastError?.message || 'Capture failed.' });
          return;
        }
        sendResponse({ ok: true, dataUrl });
      });
      return true;
    }

    case 'UPDATE_SKILL': {
      if (session && session.active && (msg.sat_category || msg.topic)) {
        const broadTopic = msg.topic || broadTopicFromCategory(msg.sat_category);
        const current = session.skill_map[broadTopic] ?? 0.5;
        if (msg.correct) {
          session.skill_map[broadTopic] = Math.min(1, current + 0.1);
          boostPlantHealth(CHAT_PLANT_REWARD);
          if (msg.sat_category) adjustCategorySkill(msg.sat_category, 0.1);
        } else {
          const penalty = 0.02 * (msg.hintsUsed || 0);
          session.skill_map[broadTopic] = Math.max(0, current - penalty);
          if (msg.sat_category) adjustCategorySkill(msg.sat_category, -penalty);
        }
        persistSession();
        broadcastToSidebar({ type: 'SESSION_UPDATE', session });
      }
      sendResponse({ ok: true });
      break;
    }

    case 'UPDATE_SKILLS_STATE': {
      if (session && session.active) {
        session.skill_map = msg.skill_map;
        session.questions.push(msg.question_record);
        persistSession();
        broadcastToSidebar({ type: 'SESSION_UPDATE', session });
      }
      sendResponse({ ok: true });
      break;
    }

    case 'OLLAMA_CHAT': {
      (async () => {
        try {
          const text = await callOllamaChat(msg.messages, msg.currentQuestion);
          sendResponse({ ok: true, text });
        } catch (err) {
          sendResponse({ ok: false, error: getFriendlyOllamaError(err) });
        }
      })();
      return true;
    }
  }

  return true;
});

// ─── Summary ──────────────────────────────────────────────────────
function generateSummaryData() {
  const elapsedMin = session.end_time
    ? Math.round((session.end_time - session.start_time) / 60000)
    : session.duration_min;

  const categoryMap = session.category_map || {};
  const categoriesScanned = Object.entries(categoryMap).map(([category, data]) => ({
    category,
    score: Math.round((data.score ?? 0.5) * 100),
    scans: data.scans || 0,
    url: CATEGORY_PRACTICE_LINKS[category] || null
  }));

  const practiceLinks = categoriesScanned
    .filter(entry => entry.scans > 0 && entry.score < 55)
    .sort((a, b) => a.score - b.score);

  return {
    plant_health:         readPlantHealth(session),
    focus_score:          readPlantHealth(session),
    plant_species:        session.plant_species || null,
    tab_switches:         session.tab_switches,
    scan_count:           session.scan_count,
    questions_attempted:  session.questions.length,
    duration_actual:      elapsedMin,
    categories_scanned:   categoriesScanned,
    practice_links:       practiceLinks
  };
}

// ─── Command shortcut ─────────────────────────────────────────────
chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture_question') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab) chrome.runtime.sendMessage({ type: 'CAPTURE_QUESTION' });
    });
  }
});

// ─── Restore session on service worker wake ───────────────────────
chrome.storage.local.get(['activeSession'], (res) => {
  if (!res.activeSession) return;
  session = res.activeSession;
  if (!session.category_map) session.category_map = {};
  if (!session.plant_last_tick) {
    session.plant_last_tick = session.start_time ?? Date.now();
  }
  if (session.active) {
    applyPassivePlantGrowth(false);
    schedulePlantGrowthAlarm();
  }
});