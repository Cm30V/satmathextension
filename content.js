// content.js — Injected into every page
// Handles: interactive region selection, keyboard shortcuts, and visual progress overlays

(function () {
  'use strict';

  // Prevent double-injection
  if (window.__satAgentInjected) return;
  window.__satAgentInjected = true;

  // ─── State Variables ─────────────────────────────────────────────
  let overlay = null;

  // ─── Visual Status Overlay ────────────────────────────────────────
  const STATUS_CONFIG = {
    scanning:  { text: 'Select a region by dragging...', icon: '📸', color: '#fbbf24' },
    analyzing: { text: 'Analyzing with Ollama...',       icon: '🔍', color: '#7c6af7', pulse: true },
    ready:     { text: 'Question analyzed! Check sidebar.', icon: '✅', color: '#16a34a' },
    error:     { text: 'Analysis failed or cancelled.',  icon: '❌', color: '#dc2626' }
  };

  function showStatusOverlay(status = 'scanning') {
    removeStatusOverlay();

    const info = STATUS_CONFIG[status] || STATUS_CONFIG.scanning;
    overlay = document.createElement('div');
    overlay.id = 'sat-agent-status-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483647;
      background: rgba(15, 17, 23, 0.95);
      border: 1px solid rgba(124, 106, 247, 0.6);
      border-radius: 12px;
      padding: 12px 18px;
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
      font-weight: 500;
      color: #e8eaf6;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      backdrop-filter: blur(8px);
      pointer-events: none;
      transition: opacity 0.2s ease;
    `;

    const iconEl = document.createElement('span');
    iconEl.style.cssText = `
      display: inline-block;
      font-size: 16px;
      color: ${info.color};
      ${info.pulse ? 'animation: sat-pulse 1.2s infinite ease-in-out;' : ''}
    `;
    iconEl.textContent = info.icon;

    const textEl = document.createElement('span');
    textEl.textContent = info.text;

    overlay.appendChild(iconEl);
    overlay.appendChild(textEl);

    if (!document.getElementById('sat-agent-keyframes')) {
      const style = document.createElement('style');
      style.id = 'sat-agent-keyframes';
      style.textContent = `
        @keyframes sat-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(0.85); opacity: 0.5; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(overlay);
  }

  function removeStatusOverlay(delay = 0) {
    if (!overlay) return;
    if (delay) {
      const toRemove = overlay;
      overlay = null;
      setTimeout(() => toRemove.remove(), delay);
    } else {
      overlay.remove();
      overlay = null;
    }
  }

  // ─── Text Selection Helper ───────────────────────────────────────
  function getSelectedText() {
    const sel = window.getSelection();
    return sel ? sel.toString().trim() : '';
  }

  // ─── Region Capture Engine ───────────────────────────────────────
  function initRegionCapture(sendResponse) {
    showStatusOverlay('scanning');

    const canvas = document.createElement('canvas');
    canvas.id = 'sat-agent-crop-canvas';
    canvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2147483646;
      cursor: crosshair;
    `;
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.scale(dpr, dpr);

    let startX = 0, startY = 0, isDragging = false;

    function drawMask(x = 0, y = 0, w = 0, h = 0) {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.fillStyle = 'rgba(15, 17, 23, 0.45)';
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      if (isDragging) {
        const left = Math.min(x, x + w);
        const top = Math.min(y, y + h);
        const width = Math.abs(w);
        const height = Math.abs(h);
        ctx.clearRect(left, top, width, height);
        ctx.strokeStyle = '#7c6af7';
        ctx.lineWidth = 2;
        ctx.strokeRect(left, top, width, height);
      }
    }
    drawMask();

    // Allow user to cancel with Escape
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        cleanup();
        removeStatusOverlay();
        sendResponse({ ok: false, error: 'User cancelled capture sequence.' });
      }
    };

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      isDragging = true;
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      drawMask(startX, startY, e.clientX - startX, e.clientY - startY);
    };

    const onMouseUp = async (e) => {
      if (!isDragging) return;
      isDragging = false;

      const endX = e.clientX;
      const endY = e.clientY;

      cleanup();

      const rect = {
        x: Math.min(startX, endX),
        y: Math.min(startY, endY),
        w: Math.abs(endX - startX),
        h: Math.abs(endY - startY)
      };

      if (rect.w < 12 || rect.h < 12) {
        removeStatusOverlay();
        sendResponse({ ok: false, error: 'Selection region too small.' });
        return;
      }

      showStatusOverlay('analyzing');

      // ── Bug #2 fix: message type matches the new GET_TAB_STREAM handler ──
      chrome.runtime.sendMessage({ type: 'GET_TAB_STREAM' }, async (response) => {
        if (chrome.runtime.lastError) {
          showStatusOverlay('error');
          removeStatusOverlay(3000);
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }

        if (!response || !response.dataUrl) {
          showStatusOverlay('error');
          removeStatusOverlay(3000);
          sendResponse({ ok: false, error: response?.error || 'Failed to acquire tab screenshot.' });
          return;
        }

        try {
          const croppedBase64 = await cropImageSource(response.dataUrl, rect, dpr);
          sendResponse({ ok: true, dataUrl: croppedBase64, selectedText: getSelectedText() });
        } catch (err) {
          showStatusOverlay('error');
          removeStatusOverlay(3000);
          sendResponse({ ok: false, error: err.message });
        }
      });
    };

    function cleanup() {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyDown);
      canvas.remove();
    }

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
  }

  // Crops a region from a full-page screenshot using Canvas
  function cropImageSource(masterDataUrl, rect, dpr) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = rect.w * dpr;
        cropCanvas.height = rect.h * dpr;
        const cropCtx = cropCanvas.getContext('2d');
        cropCtx.drawImage(
          img,
          rect.x * dpr, rect.y * dpr, rect.w * dpr, rect.h * dpr,
          0, 0, rect.w * dpr, rect.h * dpr
        );
        resolve(cropCanvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Failed parsing screenshot stream.'));
      img.src = masterDataUrl;
    });
  }

  // ─── Messaging Router ───────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'START_REGION_CAPTURE') {
      initRegionCapture(sendResponse);
      return true; // Keep response channel open
    }
    if (msg.type === 'CAPTURE_ANALYZING') {
      showStatusOverlay('analyzing');
      sendResponse({ ok: true });
    }
    if (msg.type === 'CAPTURE_DONE') {
      showStatusOverlay('ready');
      removeStatusOverlay(2500);
      sendResponse({ ok: true });
    }
    if (msg.type === 'CAPTURE_ERROR') {
      showStatusOverlay('error');
      removeStatusOverlay(3000);
      sendResponse({ ok: true });
    }
    if (msg.type === 'PING') {
      sendResponse({ ok: true });
    }
  });

  // ─── Hotkey Fallback (Cmd/Ctrl+Shift+D) ─────────────────────────
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toUpperCase() === 'D') {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: 'CAPTURE_QUESTION' });
    }
  });

})();