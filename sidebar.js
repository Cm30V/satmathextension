// sidebar.js — SAT Tutor Sidebar (Pipeline v2)
// Displays: answer choices, LaTeX, given/goal, diagram notes, pipeline stage progress
// Chat: passes full canonical schema context to Stage 4 tutor

import {
  normalizeMathDelimiters,
  stripMathDelimitersFromExpression,
  formatAnswerChoicesForDisplay,
  solutionIncludesAnswerChoices,
} from './latexRepair.js';

const PLANT = window.LivePlant;

function getPlantHealth(session) {
  return PLANT.readHealth(session);
}

function renderPlant(session) {
  if (!els.plantVisual || !session) return 0;

  const health = PLANT.renderPlant(els.plantVisual, session);
  const label = PLANT.getStageLabel(health, session.plant_species);
  const color = PLANT.getAccentColor(health);

  els.plantLabel.textContent = `${label} — Health ${health}`;
  els.plantBar.style.width = `${health}%`;
  els.plantBar.style.background = color;
  els.plantScore.textContent = health;
  els.sbFocus.textContent = health;

  const headerDot = els.headerPlant?.querySelector('.header-plant-dot');
  if (headerDot) headerDot.style.background = color;

  return health;
}

function formatTime(seconds) {
  const m = Math.floor(Math.abs(seconds) / 60).toString().padStart(2, '0');
  const s = (Math.abs(seconds) % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ─── State ────────────────────────────────────────────────────────
let currentSession = null;
let currentQuestion = null;
let chatHistory = [];
let activeHintIndex = -1;
let timerInterval = null;

// ─── DOM Elements ─────────────────────────────────────────────────
const els = {
  panelChat:    document.getElementById('panel-chat'),
  panelStreaks: document.getElementById('panel-streaks'),
  panelSummary: document.getElementById('panel-summary'),

  plantVisual:  document.getElementById('plantVisual'),
  plantLabel:   document.getElementById('plantLabel'),
  plantBar:     document.getElementById('plantBar'),
  plantScore:   document.getElementById('plantScore'),
  headerPlant:  document.getElementById('headerPlant'),
  headerSub:    document.getElementById('headerSub'),
  statusBar:    document.getElementById('statusBar'),
  plantSection: document.getElementById('plantSection'),
  tabsRow:      document.getElementById('tabsRow'),
  noSessionView:document.getElementById('noSessionView'),
  sbTimer:      document.getElementById('sbTimer'),
  sbFocus:      document.getElementById('sbFocus'),
  sbScans:      document.getElementById('sbScans'),

  chatMessages: document.getElementById('chatMessages'),
  btnScan:      document.getElementById('btnScan'),
  btnHint:      document.getElementById('btnHint'),
  btnSimilar:   document.getElementById('btnSimilar'),
  btnStrategy:  document.getElementById('btnStrategy'),
  btnSolution:  document.getElementById('btnSolution'),
  chatInput:    document.getElementById('chatInput'),
  sendBtn:      document.getElementById('sendBtn'),
  summaryPanel: document.getElementById('summaryPanel'),

  // Streaks
  streakCount:      document.getElementById('streakCount'),
  streakHeroSub:    document.getElementById('streakHeroSub'),
  streakFlame:      document.getElementById('streakFlame'),
  statWeekTotal:    document.getElementById('statWeekTotal'),
  statBestStreak:   document.getElementById('statBestStreak'),
  statTotalSessions:document.getElementById('statTotalSessions'),
  streakChartWrap:  document.getElementById('streakChartWrap'),
  streakDotsRow:    document.getElementById('streakDotsRow'),
};

// ─── Tab Navigation ───────────────────────────────────────────────
const tabButtons = document.querySelectorAll('.tab[data-tab]');

function switchTab(target) {
  tabButtons.forEach(t => t.classList.toggle('active', t.dataset.tab === target));
  [els.panelChat, els.panelStreaks, els.panelSummary].forEach(p => p.classList.remove('active'));
  if (target === 'chat') {
    els.panelChat.classList.add('active');
  } else if (target === 'streaks') {
    els.panelStreaks.classList.add('active');
    renderStreaksPanel();
  } else if (target === 'summary') {
    els.panelSummary.classList.add('active');
  }
}

tabButtons.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

// ─── Scan Button States ───────────────────────────────────────────
const SCAN_STAGE_LABELS = {
  idle:       { text: '📸 Scan Question', disabled: false },
  scanning:   { text: '📸 Selecting Region...', disabled: true },
  stage1:     { text: '🔍 Stage 1: Extracting text & equations...', disabled: true },
  stage2:     { text: '🔧 Stage 2: Cleaning LaTeX...', disabled: true },
  stage3:     { text: '🧠 Stage 3: Structuring problem...', disabled: true },
  analyzing:  { text: '🔍 Analyzing...', disabled: true },
};

function setScanBtnState(state) {
  const config = SCAN_STAGE_LABELS[state] || SCAN_STAGE_LABELS.idle;
  els.btnScan.disabled = config.disabled;
  els.btnScan.textContent = config.text;
  els.btnScan.style.opacity = config.disabled ? '0.7' : '1';
}

// ─── Header UI ────────────────────────────────────────────────────
function updateHeaderUI(session) {
  currentSession = session;

  if (!session) {
    els.noSessionView.style.display = 'flex';
    els.statusBar.style.display = 'none';
    els.plantSection.style.display = 'none';
    els.tabsRow.style.display = 'none';
    els.headerSub.textContent = 'No active session';
    if (els.headerPlant) {
      const dot = els.headerPlant.querySelector('.header-plant-dot');
      if (dot) dot.style.background = 'var(--muted)';
    }
    clearInterval(timerInterval);
    return;
  }

  els.noSessionView.style.display = 'none';
  els.statusBar.style.display = 'flex';
  els.plantSection.style.display = 'block';
  els.tabsRow.style.display = 'flex';

  renderPlant(session);
  els.sbScans.textContent = session.scan_count || 0;
  els.headerSub.textContent = session.active ? 'Session active' : 'Session ended';

  clearInterval(timerInterval);
  if (session.active) {
    const runTimer = () => {
      const elapsed = Math.floor((Date.now() - session.start_time) / 1000);
      const remaining = (session.duration_min * 60) - elapsed;
      if (remaining <= 0) {
        els.sbTimer.textContent = '00:00';
        clearInterval(timerInterval);
      } else {
        els.sbTimer.textContent = formatTime(remaining);
      }
    };
    runTimer();
    timerInterval = setInterval(runTimer, 1000);
  } else {
    els.sbTimer.textContent = '—';
  }
}

// ─── Math Rendering ───────────────────────────────────────────────
function renderMath(element) {
  if (typeof renderMathInElement === 'undefined') {
    console.warn('[SAT Tutor] KaTeX is not available — using lightweight math fallback.');
    renderMathFallback(element);
    return;
  }
  renderMathInElement(element, {
    delimiters: [
      { left: '$$', right: '$$', display: true  },
      { left: '\\[', right: '\\]', display: true  },
      { left: '\\\\[', right: '\\\\]', display: true  },
      { left: '\\(', right: '\\)', display: false },
      { left: '\\\\(', right: '\\\\)', display: false },
    ],
    throwOnError: false,
    output: 'html',
  });
}

function mathToFallbackHtml(tex, display = false) {
  let html = escapeHtml(stripMathDelimitersFromExpression(tex))
    .replace(/\\times/g, '&times;')
    .replace(/\\div/g, '&divide;')
    .replace(/\\pm/g, '&plusmn;')
    .replace(/\\leq/g, '&le;')
    .replace(/\\geq/g, '&ge;')
    .replace(/\\neq/g, '&ne;')
    .replace(/\\cdot/g, '&middot;')
    .replace(/\\sqrt\{([^{}]+)\}/g, '&radic;<span class="math-radicand">$1</span>')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '<span class="math-frac"><span>$1</span><span>$2</span></span>')
    .replace(/\^\{([^{}]+)\}/g, '<sup>$1</sup>')
    .replace(/_\{([^{}]+)\}/g, '<sub>$1</sub>')
    .replace(/\^([A-Za-z0-9])/g, '<sup>$1</sup>')
    .replace(/_([A-Za-z0-9])/g, '<sub>$1</sub>');
  const cls = display ? 'math-fallback math-fallback-display' : 'math-fallback';
  return `<span class="${cls}">${html}</span>`;
}

function renderMathFallback(element) {
  element.innerHTML = element.innerHTML.replace(
    /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g,
    (_m, dollars, brackets, parens, inlineDollar) => {
      const tex = dollars ?? brackets ?? parens ?? inlineDollar ?? '';
      return mathToFallbackHtml(tex, Boolean(dollars || brackets));
    }
  );
}

// Converts plain text to safe HTML, then renders math in-place.
// Preserves newlines and escapes HTML special chars in both math and
// non-math segments — entities like &lt; are restored to literal characters
// by the browser's HTML parser before KaTeX reads the text nodes, so this
// is required for any LaTeX containing <, >, or & (e.g. "y < x + 7").
function textToSafeHtml(text) {
  const normalized = normalizeMathDelimiters(String(text ?? ''));

  // Split on LaTeX delimiters so math and non-math segments can both be
  // escaped, then handed to KaTeX as their decoded (unescaped) form.
  const parts = [];
  // Matches $$...$$, \[...\], \(...\). Single dollars are currency in word problems.
  const re = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g;
  let last = 0, m;
  while ((m = re.exec(normalized)) !== null) {
    if (m.index > last) {
      parts.push(escapeHtml(normalized.slice(last, m.index)));
    }
    parts.push(escapeHtml(m[0])); // escaped LaTeX — KaTeX reads the decoded text node
    last = m.index + m[0].length;
  }
  if (last < normalized.length) parts.push(escapeHtml(normalized.slice(last)));
  return parts.join('').replace(/\n/g, '<br>');
}

// ─── Chat Helpers ─────────────────────────────────────────────────
function addMessage(role, text) {
  const msg = document.createElement('div');
  msg.className = `msg ${role}`;
  const content = document.createElement('div');
  content.className = 'msg-bubble';
  content.innerHTML = textToSafeHtml(text);
  renderMath(content);
  msg.appendChild(content);
  els.chatMessages.appendChild(msg);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  if (role === 'user' || role === 'ai') {
    chatHistory.push({ role, content: text });
  }
}

function isDisplayableLatex(value) {
  const s = stripMathDelimitersFromExpression(value || '');
  if (!s) return false;
  if (s.length > 140) return false;
  const spaceRatio = (s.match(/\s/g) || []).length / Math.max(s.length, 1);
  const glued = (s.match(/[a-z]{10,}/gi) || []).length;
  if (glued >= 2 && spaceRatio < 0.08) return false;
  if (/\b(which function|figure shown|right rectangular|similar to|in terms of)\b/i.test(s)) return false;
  return /[=^_{}\\]/.test(s) || /(?:V|f|g|h)\s*\([^)]+\)\s*=/.test(s);
}

// Renders a rich structured question card in the chat
function addQuestionCard(data) {
  const card = document.createElement('div');
  card.className = 'msg system';

  const confidence = Number.isFinite(Number(data.confidence)) ? Number(data.confidence) : 0.5;
  const confidencePct = Math.round(confidence * 100);
  const confidenceColor = confidence >= 0.75 ? '#4ade80' : confidence >= 0.5 ? '#fbbf24' : '#f87171';

  const answerChoicesHTML = Array.isArray(data.answer_choices) && data.answer_choices.length > 0
    ? `<div class="qcard-section">
        <div class="qcard-label">Answer Choices</div>
        <div class="qcard-choices">${data.answer_choices.map(c =>
          `<span class="qcard-choice">${textToSafeHtml(c)}</span>`
        ).join('')}</div>
       </div>`
    : '';

  // latex_clean is an equation field, not prose. Keep it as one expression so
  // token-level prose cleanup does not turn "4x^{2}" into nested inline math.
  const latexRaw = isDisplayableLatex(data.latex_clean) ? stripMathDelimitersFromExpression(data.latex_clean || '') : '';
  const latexWrapped = latexRaw ? `$$${latexRaw}$$` : '';
  const latexHTML = latexRaw
    ? `<div class="qcard-section">
        <div class="qcard-label">Equation${data.latex_issues?.length ? ' ⚠️ (cleaned)' : ''}</div>
        <div class="qcard-latex">${escapeHtml(latexWrapped)}</div>
       </div>`
    : '';

  const givenHTML = Array.isArray(data.given) && data.given.length > 0
    ? `<div class="qcard-section">
        <div class="qcard-label">Given</div>
        <ul class="qcard-list">${data.given.map(g => `<li>${textToSafeHtml(g)}</li>`).join('')}</ul>
       </div>`
    : '';

  const goalHTML = data.goal
    ? `<div class="qcard-section">
        <div class="qcard-label">Find</div>
        <div class="qcard-goal">${textToSafeHtml(data.goal)}</div>
       </div>`
    : '';

  const diagramHTML = data.diagram_notes
    ? `<div class="qcard-section">
        <div class="qcard-label">Diagram</div>
        <div class="qcard-diagram">${textToSafeHtml(data.diagram_notes)}</div>
       </div>`
    : '';

  const problemTypeHTML = data.problem_type
    ? `<span class="qcard-pill">${escapeHtml(data.problem_type)}</span>`
    : '';

  const unreadableHTML = Array.isArray(data.unreadable_parts) && data.unreadable_parts.length > 0
    ? `<div class="qcard-warn">⚠️ Unclear: ${data.unreadable_parts.join('; ')} — try rescanning tighter.</div>`
    : '';

  card.innerHTML = `
    <div class="qcard">
      <div class="qcard-header">
        <span class="qcard-topic">${escapeHtml(data.sat_category || data.topic)} · ${escapeHtml(data.difficulty)}</span>
        ${problemTypeHTML}
        <span class="qcard-confidence" style="color:${confidenceColor}">${confidencePct}% confidence</span>
      </div>
      <div class="qcard-question">${textToSafeHtml(data.question_text)}</div>
      ${latexHTML}
      ${givenHTML}
      ${goalHTML}
      ${answerChoicesHTML}
      ${diagramHTML}
      ${unreadableHTML}
    </div>
  `;

  els.chatMessages.appendChild(card);
  renderMath(card);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatScanCount(count) {
  const scans = Number.isFinite(Number(count)) ? Number(count) : 0;
  return `${scans} scan${scans === 1 ? '' : 's'}`;
}

function showTypingIndicator(show) {
  let indicator = document.getElementById('sat-typing-indicator');
  if (show) {
    if (indicator) return;
    indicator = document.createElement('div');
    indicator.id = 'sat-typing-indicator';
    indicator.className = 'msg ai';
    indicator.innerHTML = `
      <div class="msg-bubble" style="display:flex;gap:4px;padding:10px 14px;">
        <div class="typing-dot"></div>
        <div class="typing-dot" style="animation-delay:0.2s"></div>
        <div class="typing-dot" style="animation-delay:0.4s"></div>
      </div>
    `;
    els.chatMessages.appendChild(indicator);
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  } else if (indicator) {
    indicator.remove();
  }
}

// ─── Question Card CSS (injected once) ───────────────────────────
(function injectQCardStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .qcard {
      background: var(--surface, #fff);
      border: 2px solid var(--border, #111);
      border-radius: 12px;
      padding: 12px 14px;
      margin: 4px 0;
      font-size: 12px;
    }
    .qcard-header {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .qcard-topic {
      font-weight: 800;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text, #111);
    }
    .qcard-pill {
      background: var(--surface2, #f0f0e8);
      border: 1px solid var(--border, #111);
      border-radius: 6px;
      padding: 2px 7px;
      font-size: 10px;
      font-weight: 700;
      color: var(--muted, #666);
      text-transform: capitalize;
    }
    .qcard-confidence {
      margin-left: auto;
      font-size: 11px;
      font-weight: 700;
    }
    .qcard-question {
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--text, #111);
      margin-bottom: 10px;
      white-space: pre-wrap;
    }
    .qcard-section {
      margin-bottom: 8px;
    }
    .qcard-label {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--muted, #888);
      margin-bottom: 4px;
    }
    .qcard-latex {
      font-family: 'Courier New', monospace;
      font-size: 11.5px;
      background: var(--surface2, #f0f0e8);
      border-radius: 6px;
      padding: 6px 10px;
      word-break: break-all;
      color: var(--text, #111);
    }
    .qcard-list {
      margin: 0;
      padding-left: 16px;
      color: var(--text, #111);
      line-height: 1.7;
    }
    .qcard-goal {
      font-weight: 700;
      color: var(--text, #111);
    }
    .qcard-choices {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }
    .qcard-choice {
      background: var(--surface2, #f0f0e8);
      border: 1.5px solid var(--border, #111);
      border-radius: 7px;
      padding: 3px 9px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text, #111);
    }
    .qcard-diagram {
      font-size: 11.5px;
      color: var(--muted, #666);
      font-style: italic;
      line-height: 1.5;
    }
    .qcard-warn {
      margin-top: 6px;
      font-size: 11px;
      color: #d97706;
      font-weight: 600;
    }
  `;
  document.head.appendChild(style);
})();

// ─── Scan Button ──────────────────────────────────────────────────
els.btnScan.addEventListener('click', async () => {
  if (els.btnScan.disabled) return;
  setScanBtnState('scanning');
  addMessage('system', '📸 Drag to select the question region...');

  chrome.runtime.sendMessage({ type: 'CAPTURE_QUESTION' }, response => {
    if (chrome.runtime.lastError) {
      setScanBtnState('idle');
      addMessage('error', `❌ Capture error: ${chrome.runtime.lastError.message}`);
      return;
    }
    if (!response || !response.ok) {
      setScanBtnState('idle');
      addMessage('error', `❌ Capture failed: ${response?.error || 'Unknown error'}`);
    }
  });
});

// ─── Question Context Initialization ─────────────────────────────
function initializeQuestionContext(data) {
  currentQuestion = data;
  chatHistory = [];
  activeHintIndex = -1;
  els.chatMessages.innerHTML = '';

  // Show the rich question card
  addQuestionCard(data);

  const confidence = Number.isFinite(Number(data.confidence)) ? Number(data.confidence) : 0.5;
  addMessage('ai', `Problem structured and ready! I have ${data.hints?.length || 0} progressive hints, a test-taking strategy, and a full step-by-step solution. What would you like to do?`);

  els.btnHint.disabled = false;
  els.btnStrategy.disabled = false;
  els.btnSolution.disabled = false;
  els.btnSimilar.disabled = false;
  els.chatInput.disabled = false;
  els.sendBtn.disabled = false;
}

// ─── Action Buttons ───────────────────────────────────────────────
els.btnHint.addEventListener('click', () => {
  if (!currentQuestion?.hints) return;
  activeHintIndex++;
  if (activeHintIndex < currentQuestion.hints.length) {
    const totalHints = currentQuestion.hints.length;
    addMessage('ai', `💡 Hint ${activeHintIndex + 1}/${totalHints}: ${currentQuestion.hints[activeHintIndex]}`);
    chrome.runtime.sendMessage({ type: 'HINT_USED' });
  } else {
    addMessage('ai', "That's all the hints! Try 'Solution' if you're still stuck.");
    els.btnHint.disabled = true;
  }
});

els.btnStrategy.addEventListener('click', () => {
  if (!currentQuestion?.strategy) return;
  let strategyText = `🎯 Test-Taking Strategy:\n${currentQuestion.strategy}`;
  if (currentQuestion.constraints) {
    strategyText += `\n\n⚠️ Constraints to keep in mind: ${currentQuestion.constraints}`;
  }
  addMessage('ai', strategyText);
});

els.btnSolution.addEventListener('click', () => {
  if (!currentQuestion?.solution) return;

  let solutionText = `👁 Step-by-Step Breakdown:\n${currentQuestion.solution}`;

  if (
    Array.isArray(currentQuestion.answer_choices) &&
    currentQuestion.answer_choices.length > 0 &&
    !solutionIncludesAnswerChoices(solutionText)
  ) {
    solutionText += `\n\n${formatAnswerChoicesForDisplay(currentQuestion.answer_choices)}`;
  }

  addMessage('ai', solutionText);
  chrome.runtime.sendMessage({
    type: 'UPDATE_SKILL',
    sat_category: currentQuestion.sat_category,
    topic: currentQuestion.topic,
    correct: false,
    hintsUsed: activeHintIndex + 1
  });
});

els.btnSimilar.addEventListener('click', () => {
  if (!currentQuestion) return;
  const context = currentQuestion.problem_type
    ? `${currentQuestion.sat_category || currentQuestion.topic} — ${currentQuestion.problem_type}`
    : (currentQuestion.sat_category || currentQuestion.topic);
  sendMessageToTutor(`Give me a new practice problem with the same structure as the one we analyzed (${context}). Do not reuse any of the same numbers.`);
});

// ─── Chat ─────────────────────────────────────────────────────────
async function sendMessageToTutor(forcedText = '') {
  const text = (forcedText || els.chatInput.value).trim();
  if (!text) return;
  if (!forcedText) els.chatInput.value = '';
  addMessage('user', text);
  showTypingIndicator(true);

  chrome.runtime.sendMessage({
    type: 'OLLAMA_CHAT',
    messages: chatHistory,
    currentQuestion    // full canonical schema — Stage 4 tutor uses this for rich context
  }, response => {
    showTypingIndicator(false);
    if (response?.ok) {
      addMessage('ai', response.text);
    } else {
      addMessage('error', `❌ Tutor chat failed: ${response?.error || 'Service unreachable'}`);
    }
  });
}

els.sendBtn.addEventListener('click', () => sendMessageToTutor());
els.chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessageToTutor();
  }
});

// ─── Streaks & Progress Engine ────────────────────────────────────

let streaksRangeDays = 7; // default view

/**
 * Storage schema (chrome.storage.local key: 'studyHistory')
 * An array of session records, oldest first:
 *   { date: 'YYYY-MM-DD', minutes: number, scans: number, health: number }
 */

function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function dateStrFromDaysAgo(n) {
  const d = new Date(Date.now() - n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function shortDayLabel(dateStr) {
  const [y, m, day] = dateStr.split('-').map(Number);
  return ['Su','Mo','Tu','We','Th','Fr','Sa'][new Date(y, m-1, day).getDay()];
}

/** Append or merge a completed session into persistent studyHistory. */
function recordSessionToHistory(session) {
  if (!session || !session.start_time) return;
  const dateStr = todayDateStr();
  const minutes = Math.round((session.duration_min ?? 30) * ((session.duration_actual ?? session.duration_min ?? 30) / (session.duration_min ?? 30)));
  const actualMins = session.duration_actual ?? session.duration_min ?? 30;
  const health = Math.round(session.plant_health ?? session.focus_score ?? 0);
  const scans = session.scan_count || 0;

  chrome.storage.local.get('studyHistory', ({ studyHistory }) => {
    const history = Array.isArray(studyHistory) ? studyHistory : [];
    const existing = history.find(r => r.date === dateStr);
    if (existing) {
      existing.minutes += actualMins;
      existing.scans += scans;
      existing.health = Math.max(existing.health, health);
      existing.sessions = (existing.sessions || 1) + 1;
    } else {
      history.push({ date: dateStr, minutes: actualMins, scans, health, sessions: 1 });
    }
    // Keep only last 365 days
    const cutoff = dateStrFromDaysAgo(365);
    const trimmed = history.filter(r => r.date >= cutoff);
    chrome.storage.local.set({ studyHistory: trimmed });
  });
}

function computeStreakFromHistory(history) {
  if (!history || !history.length) return 0;
  const today = todayDateStr();
  const studied = new Set(history.map(r => r.date));
  let streak = 0;
  let cursor = studied.has(today) ? 0 : 1;
  // Walk backwards from today (or yesterday if not studied today yet)
  while (true) {
    const d = dateStrFromDaysAgo(cursor);
    if (studied.has(d)) { streak++; cursor++; }
    else break;
  }
  return streak;
}

function computeBestStreak(history) {
  if (!history || !history.length) return 0;
  const dates = [...new Set(history.map(r => r.date))].sort();
  let best = 0, cur = 0, prev = null;
  for (const d of dates) {
    if (prev) {
      const diff = (new Date(d) - new Date(prev)) / 86400000;
      if (diff === 1) { cur++; }
      else { cur = 1; }
    } else { cur = 1; }
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}

function getHistoryInRange(history, rangeDays) {
  if (!rangeDays) return history; // 0 = all
  const cutoff = dateStrFromDaysAgo(rangeDays - 1);
  return history.filter(r => r.date >= cutoff);
}

function renderStreakChart(history, rangeDays) {
  const canvas = document.getElementById('streakChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const rangeHistory = getHistoryInRange(history, rangeDays || 90);
  if (!rangeHistory.length) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#6b6b66';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('No study data yet', canvas.width / 2, canvas.height / 2);
    return;
  }

  // Build a date-keyed map for easy lookup
  const byDate = {};
  rangeHistory.forEach(r => { byDate[r.date] = (byDate[r.date] || 0) + r.minutes; });

  // Generate all dates in range
  const days = rangeDays || rangeHistory.length;
  const actualDays = Math.min(days, 60); // cap display at 60 bars
  const labels = [];
  const data = [];
  for (let i = actualDays - 1; i >= 0; i--) {
    const d = dateStrFromDaysAgo(i);
    labels.push(shortDayLabel(d));
    data.push(byDate[d] || 0);
  }

  const maxVal = Math.max(...data, 1);
  const W = canvas.width;
  const H = canvas.height;
  const padL = 28, padR = 8, padT = 10, padB = 22;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  ctx.clearRect(0, 0, W, H);

  // Grid lines
  const gridLines = 4;
  ctx.strokeStyle = 'rgba(17,17,17,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridLines; i++) {
    const y = padT + chartH - (i / gridLines) * chartH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    // Y axis label
    ctx.fillStyle = '#6b6b66';
    ctx.font = `${Math.min(9, 9)}px system-ui`;
    ctx.textAlign = 'right';
    ctx.fillText(Math.round((i / gridLines) * maxVal) + 'm', padL - 3, y + 3);
  }

  // Bars
  const barW = Math.max(2, Math.floor(chartW / labels.length) - 2);
  const spacing = chartW / labels.length;

  labels.forEach((lbl, i) => {
    const x = padL + i * spacing + spacing / 2;
    const barH = data[i] > 0 ? Math.max(3, (data[i] / maxVal) * chartH) : 0;
    const y = padT + chartH - barH;

    // Bar fill
    const isToday = i === labels.length - 1;
    ctx.fillStyle = isToday ? '#111111' : '#d4f95a';
    const radius = Math.min(3, barW / 2);
    if (barH > 0) {
      ctx.beginPath();
      ctx.moveTo(x - barW/2 + radius, y);
      ctx.lineTo(x + barW/2 - radius, y);
      ctx.quadraticCurveTo(x + barW/2, y, x + barW/2, y + radius);
      ctx.lineTo(x + barW/2, padT + chartH);
      ctx.lineTo(x - barW/2, padT + chartH);
      ctx.lineTo(x - barW/2, y + radius);
      ctx.quadraticCurveTo(x - barW/2, y, x - barW/2 + radius, y);
      ctx.closePath();
      ctx.fill();
    }

    // Bar border
    if (barH > 0) {
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // X label (show every N-th label to avoid crowding)
    const showEvery = labels.length > 20 ? 7 : labels.length > 10 ? 3 : 1;
    if (i % showEvery === 0 || i === labels.length - 1) {
      ctx.fillStyle = isToday ? '#111111' : '#6b6b66';
      ctx.font = `${isToday ? 700 : 400} 9px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(lbl, x, H - 4);
    }
  });
}

function renderDotHeatmap(history) {
  const row = els.streakDotsRow;
  if (!row) return;
  row.innerHTML = '';
  const today = todayDateStr();
  const studied = new Set(history.map(r => r.date));

  for (let i = 6; i >= 0; i--) {
    const dateStr = dateStrFromDaysAgo(i);
    const didStudy = studied.has(dateStr);
    const isToday = dateStr === today;

    const col = document.createElement('div');
    col.className = 'streak-dot-col';

    const dot = document.createElement('div');
    dot.className = 'streak-dot' + (didStudy ? ' studied' : '') + (isToday ? ' today' : '');
    dot.textContent = didStudy ? '✓' : (isToday ? '·' : '');

    const lbl = document.createElement('div');
    lbl.className = 'streak-dot-label';
    lbl.textContent = shortDayLabel(dateStr);

    col.appendChild(dot);
    col.appendChild(lbl);
    row.appendChild(col);
  }
}

function renderStreaksPanel() {
  chrome.storage.local.get('studyHistory', ({ studyHistory }) => {
    const history = Array.isArray(studyHistory) ? studyHistory : [];

    // Streak count
    const streak = computeStreakFromHistory(history);
    if (els.streakCount) els.streakCount.textContent = streak;
    if (els.streakFlame) {
      els.streakFlame.textContent = streak >= 7 ? '🔥' : streak >= 3 ? '🌟' : streak >= 1 ? '✨' : '🌱';
    }
    if (els.streakHeroSub) {
      const today = todayDateStr();
      const studiedToday = history.some(r => r.date === today);
      if (streak === 0) {
        els.streakHeroSub.textContent = 'Study today to start your streak!';
      } else if (!studiedToday) {
        els.streakHeroSub.textContent = `${streak} day streak — study today to keep it!`;
      } else {
        els.streakHeroSub.textContent = `${streak} day${streak !== 1 ? 's' : ''} and counting. Keep it up!`;
      }
    }

    // Week total
    const weekHistory = getHistoryInRange(history, 7);
    const weekMins = weekHistory.reduce((sum, r) => sum + (r.minutes || 0), 0);
    if (els.statWeekTotal) els.statWeekTotal.textContent = weekMins >= 60
      ? `${Math.floor(weekMins/60)}h${weekMins%60 ? (weekMins%60)+'m' : ''}`
      : `${weekMins}m`;

    // Best streak
    if (els.statBestStreak) els.statBestStreak.textContent = computeBestStreak(history);

    // Total sessions
    const totalSessions = history.reduce((sum, r) => sum + (r.sessions || 1), 0);
    if (els.statTotalSessions) els.statTotalSessions.textContent = totalSessions;

    // Chart
    renderStreakChart(history, streaksRangeDays);

    // Dot heatmap
    renderDotHeatmap(history);
  });
}

// Range selector buttons
document.querySelectorAll('.streak-range-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.streak-range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    streaksRangeDays = parseInt(btn.dataset.days);
    // Re-render just the chart with new range
    chrome.storage.local.get('studyHistory', ({ studyHistory }) => {
      renderStreakChart(Array.isArray(studyHistory) ? studyHistory : [], streaksRangeDays);
    });
  });
});

// ─── Summary Panel ────────────────────────────────────────────────
function renderSummary(summary) {
  if (!summary) return;
  switchTab('summary');
  const panel = els.summaryPanel;
  panel.innerHTML = '';

  const metricsCard = document.createElement('div');
  metricsCard.className = 'summary-card';
  metricsCard.innerHTML = `
    <div class="summary-title">Session Diagnostics</div>
    <div class="summary-metric-row" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
      <div style="flex:1;text-align:center;">
        <div style="font-size:22px;font-weight:800;">${summary.duration_actual}m</div>
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;">Duration</div>
      </div>
      <div style="flex:1;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:${PLANT.getAccentColor(summary.plant_health ?? summary.focus_score)}">${summary.plant_health ?? summary.focus_score}</div>
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;">Plant Health</div>
      </div>
      <div style="flex:1;text-align:center;">
        <div style="font-size:22px;font-weight:800;">${summary.questions_attempted}</div>
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;">Problems</div>
      </div>
    </div>
    <div style="font-size:12px;color:var(--muted2);">
      ⚠️ ${summary.tab_switches} tab switch${summary.tab_switches !== 1 ? 'es' : ''} tracked.
    </div>`;
  panel.appendChild(metricsCard);

  if (summary.practice_links?.length) {
    const practiceCard = document.createElement('div');
    practiceCard.className = 'summary-card';
    let html = '<div class="summary-title">Practice These Topics</div>';
    html += '<p style="font-size:12px;color:var(--muted2);margin:0 0 10px;">Categories you scanned that need more work — open a Khan Academy lesson:</p>';
    summary.practice_links.forEach(entry => {
      const scanLabel = formatScanCount(entry.scans);
      if (entry.url) {
        html += `<a class="practice-link" href="${escapeHtml(entry.url)}" target="_blank" rel="noopener">
          ${escapeHtml(entry.category)} <span style="opacity:.7;">(${scanLabel})</span>
        </a>`;
      } else {
        html += `<div class="practice-link" style="cursor:default;opacity:.6;">${escapeHtml(entry.category)} (${scanLabel})</div>`;
      }
    });
    practiceCard.innerHTML = html;
    panel.appendChild(practiceCard);
  }

  if (summary.categories_scanned?.length) {
    const scannedCard = document.createElement('div');
    scannedCard.className = 'summary-card';
    let html = '<div class="summary-title">Categories You Scanned</div>';
    summary.categories_scanned.forEach(entry => {
      const cls = entry.score >= 55 ? 'strong' : 'weak';
      html += `<span class="topic-pill ${cls}">${escapeHtml(entry.category)} ${formatScanCount(entry.scans)}</span>`;
    });
    scannedCard.innerHTML = html;
    panel.appendChild(scannedCard);
  }
}

// ─── End Session ──────────────────────────────────────────────────
const btnEndSession = document.getElementById('btnEndSession');
if (btnEndSession) {
  btnEndSession.addEventListener('click', () => {
    if (confirm('End the current session?')) {
      chrome.runtime.sendMessage({ type: 'END_SESSION' });
    }
  });
}

// ─── Runtime Messages ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener(msg => {
  switch (msg.type) {

    case 'CAPTURE_ANALYZING': {
      setScanBtnState('stage1');
      break;
    }

    case 'PIPELINE_STAGE': {
      // stage 1, 2, 3 progress updates from background.js
      const stateMap = { 1: 'stage1', 2: 'stage2', 3: 'stage3' };
      const btnState = stateMap[msg.stage] || 'analyzing';
      setScanBtnState(btnState);
      break;
    }

    case 'CAPTURE_ERROR': {
      setScanBtnState('idle');
      if (msg.error) addMessage('error', `❌ ${msg.error}`);
      break;
    }

    case 'QUESTION_READY': {
      setScanBtnState('idle');
      if (msg.data) {
        initializeQuestionContext(msg.data);
        // Notify the page's content script to dismiss the analyzing overlay
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          if (!tab) return;
          try {
            const result = chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_DONE' });
            if (result?.catch) result.catch(() => {});
          } catch {
            // Content script may be gone — sidebar is already updated
          }
        });
      } else {
        addMessage('error', '❌ Received empty question data.');
      }
      break;
    }

    case 'SESSION_UPDATE': {
      updateHeaderUI(msg.session);
      break;
    }

    case 'SESSION_ENDED': {
      clearInterval(timerInterval);
      updateHeaderUI(msg.session);
      if (msg.session) recordSessionToHistory(msg.session);
      renderSummary(msg.summary);
      break;
    }
  }
});

// ─── Startup: sync session state ─────────────────────────────────
chrome.runtime.sendMessage({ type: 'GET_SESSION' }, session => {
  if (session) {
    updateHeaderUI(session);
    if (session.questions?.length > 0) {
      const last = session.questions[session.questions.length - 1];
      if (last) {
        initializeQuestionContext({
          question_text:  last.text,
          sat_category:   last.sat_category || last.topic,
          topic:          last.topic,
          difficulty:     last.difficulty,
          problem_type:   last.problem_type || '',
          given:          last.given || [],
          goal:           last.goal || '',
          constraints:    last.constraints || '',
          latex_clean:    last.latex_clean || '',
          answer_choices: last.answer_choices || [],
          hints:          last.hints || [],
          strategy:       last.strategy || '',
          solution:       last.solution || '',
          confidence:     last.confidence || 0.5,
          unreadable_parts: last.unreadable_parts || [],
          diagram_notes:  last.diagram_notes || ''
        });
      }
    }
  }
});