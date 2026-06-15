// popup.js — Session setup & live status display

function getPlantHealth(session) {
  return Math.max(0, Math.min(100, Math.round(session?.plant_health ?? session?.focus_score ?? 0)));
}

function getPlantLabel(health) {
  if (health >= 67) return 'Flourishing';
  if (health >= 34) return 'Growing';
  if (health >= 12) return 'Sprouting';
  return 'Seedling';
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

let selectedDuration = 30;
let selectedCategories = new Set(['Algebra']);
let timerInterval = null;

// ─── Duration selector ───────────────────────────────────────────
document.querySelectorAll('.duration-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDuration = parseInt(btn.dataset.min);
    document.getElementById('customMin').value = '';
  });
});

document.getElementById('customMin').addEventListener('input', e => {
  const val = parseInt(e.target.value);
  if (val >= 5 && val <= 180) {
    selectedDuration = val;
    document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
  }
});

// ─── Category selector ───────────────────────────────────────────
document.querySelectorAll('.cat-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const cat = btn.dataset.cat;
    if (selectedCategories.has(cat)) {
      selectedCategories.delete(cat);
      btn.classList.remove('active');
    } else {
      selectedCategories.add(cat);
      btn.classList.add('active');
    }
  });
});

// ─── Ollama configuration persistence ────────────────────────────
const OLLAMA_DEFAULTS = {
  ollamaHost: 'http://localhost:11434',
  ollamaVisionModel: 'qwen2.5vl:7b',
  ollamaChatModel: 'qwen2.5:7b'
};

chrome.storage.local.get(Object.keys(OLLAMA_DEFAULTS), stored => {
  document.getElementById('ollamaHost').value = stored.ollamaHost || OLLAMA_DEFAULTS.ollamaHost;
  const visionModel = stored.ollamaVisionModel || OLLAMA_DEFAULTS.ollamaVisionModel;
  document.getElementById('ollamaVisionModel').value = visionModel;
  document.getElementById('ollamaChatModel').value = stored.ollamaChatModel || OLLAMA_DEFAULTS.ollamaChatModel;
});

['ollamaHost', 'ollamaVisionModel', 'ollamaChatModel'].forEach(id => {
  document.getElementById(id).addEventListener('change', e => {
    chrome.storage.local.set({ [id]: e.target.value.trim() || OLLAMA_DEFAULTS[id] });
  });
});

// ─── Start session ────────────────────────────────────────────────
document.getElementById('startBtn').addEventListener('click', () => {
  if (selectedCategories.size === 0) {
    alert('Please select at least one category.');
    return;
  }

  chrome.storage.local.set({
    ollamaHost: document.getElementById('ollamaHost').value.trim() || OLLAMA_DEFAULTS.ollamaHost,
    ollamaVisionModel: document.getElementById('ollamaVisionModel').value.trim() || OLLAMA_DEFAULTS.ollamaVisionModel,
    ollamaChatModel: document.getElementById('ollamaChatModel').value.trim() || OLLAMA_DEFAULTS.ollamaChatModel
  }, () => {
    chrome.runtime.sendMessage({
      type: 'START_SESSION',
      duration: selectedDuration,
      categories: [...selectedCategories],
    }, response => {
      if (response && response.ok) {
        showActiveUI();
      }
    });
  });
});

// ─── Open sidebar ─────────────────────────────────────────────────
document.getElementById('openSidebarBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'OPEN_SIDEBAR' });
});

// ─── End session ──────────────────────────────────────────────────
document.getElementById('endBtn').addEventListener('click', () => {
  if (!confirm('End session early?')) return;
  chrome.runtime.sendMessage({ type: 'END_SESSION' }, () => {
    showSetupUI();
  });
});

// ─── UI switchers ─────────────────────────────────────────────────
function showActiveUI() {
  document.getElementById('setupUI').classList.add('hidden');
  document.getElementById('activeUI').classList.add('visible');
  pollSessionState();
}

function showSetupUI() {
  document.getElementById('activeUI').classList.remove('visible');
  document.getElementById('setupUI').classList.remove('hidden');
  clearInterval(timerInterval);
}

// ─── Poll session state from background ──────────────────────────
function pollSessionState() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'GET_SESSION' }, session => {
      if (!session || !session.active) {
        showSetupUI();
        return;
      }
      updateActiveUI(session);
    });
  }, 500);
}

function updateActiveUI(session) {
  const elapsed = Math.floor((Date.now() - session.start_time) / 1000);
  const totalSec = session.duration_min * 60;
  const remaining = Math.max(0, totalSec - elapsed);

  document.getElementById('timerDisplay').textContent = formatTime(remaining);
  const health = getPlantHealth(session);
  document.getElementById('focusDisplay').textContent = health;
  document.getElementById('switchDisplay').textContent = session.tab_switches;
  document.getElementById('scanDisplay').textContent = session.scan_count || 0;

  const pct = (remaining / totalSec) * 100;
  document.getElementById('progressFill').style.width = `${pct}%`;

  document.getElementById('activePlantEmoji').textContent = health >= 67 ? '🌳' : health >= 34 ? '🪴' : health >= 12 ? '🌱' : '🌰';
}

// ─── On load: check if session already active ─────────────────────
chrome.runtime.sendMessage({ type: 'GET_SESSION' }, session => {
  if (session && session.active) {
    showActiveUI();
  }
});