// PHRASES - adapt per audience/user
const phrases = [
    "Hi", "Yes", "No", "Help",
    "Bathroom", "Water", "Tired", "Hungry",
    "Thank you", "Family", "Call Nurse", "Pain",
    "Please", "Adjust", "Blanket", "Music"
  ];
  
  let selected = [];
  const gridDiv = document.getElementById('phraseGrid');
  const selectedDiv = document.getElementById('selectedWords');
  const outputDiv = document.getElementById('output');
  const speakBtn = document.getElementById('speakBtn');
  const sendBtn = document.getElementById('sendBtn');
  
  // Build grid
  phrases.forEach((ph, i) => {
    const el = document.createElement("div");
    el.classList.add("grid-cell");
    el.innerText = ph;
    el.onclick = () => {
      selected.push(ph);
      updateSelected();
      highlight(i);
    };
    gridDiv.appendChild(el);
  });
  function updateSelected() {
    selectedDiv.innerText = selected.join(" ");
  }
  function highlight(idx) {
    gridDiv.childNodes.forEach((node,i) =>
      node.classList.toggle('selected', i === idx));
  }
  
  // --- WebGazer.js: gaze triggers selection (simple demo logic) ---
  window.onload = function() {
    webgazer.setGazeListener(function(data, ts) {
      if (!data) return;
      // Snap gaze to grid (for demo); real version needs calibration & dwell logic:
      const gx = data.x, gy = data.y;
      gridDiv.childNodes.forEach((node, i) => {
        const rect = node.getBoundingClientRect();
        if (gx > rect.left && gx < rect.right && gy > rect.top && gy < rect.bottom) {
          // "Dwell" simulation: select if lingered for >1s
          if (!node._dwell) node._dwell = Date.now();
          else if (Date.now() - node._dwell > 1000) node.click();
        } else {
          node._dwell = null;
        }
      });
    }).begin();
  };
  
  // --- API: Send selections for Gemini response ---
  sendBtn.onclick = async () => {
    if (selected.length === 0) { alert("Select at least one phrase."); return; }
    const resp = await fetch('http://localhost:8000/compose', {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({selections: selected, context: ""})
    });
    const data = await resp.json();
    outputDiv.innerText = data.generated;
  };
  
  // --- Web Speech API for TTS ---
  speakBtn.onclick = () => {
    const msg = new SpeechSynthesisUtterance(outputDiv.innerText);
    msg.lang = "en-US";
    speechSynthesis.speak(msg);
  };

// ========== WebGazer Stabilization + Calibration ==========
(() => {
  const cursorEl = document.getElementById('gazeCursor');
  const overlayEl = document.getElementById('calibrationOverlay');
  const calibrateBtn = document.getElementById('calibrateBtn');
  const debugToggle = document.getElementById('debugToggle');
  const cameraBtn = document.getElementById('cameraToggleBtn');

  // One Euro filter (strong smoothing, adaptive to speed)
  class OneEuroFilter {
    constructor({ minCutoff = 0.6, beta = 0.04, dCutoff = 1.0 } = {}) {
      this.minCutoff = minCutoff;
      this.beta = beta;
      this.dCutoff = dCutoff;
      this.xPrev = null;
      this.dxPrev = 0;
      this.xHat = null;
      this.tPrev = null;
    }
    static alpha(cutoff, dt) {
      const tau = 1 / (2 * Math.PI * cutoff);
      return 1 / (1 + tau / Math.max(dt, 1e-3));
    }
    filter(x, t) {
      if (this.tPrev == null) {
        this.tPrev = t;
        this.xPrev = x;
        this.xHat = x;
        return x;
      }
      const dt = Math.max((t - this.tPrev) / 1000, 1 / 240); // seconds
      this.tPrev = t;

      const dx = (x - this.xPrev) / dt;
      this.xPrev = x;

      // Filter derivative
      const aD = OneEuroFilter.alpha(this.dCutoff, dt);
      this.dxPrev = aD * dx + (1 - aD) * this.dxPrev;

      const cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev);
      const a = OneEuroFilter.alpha(cutoff, dt);
      this.xHat = a * x + (1 - a) * this.xHat;
      return this.xHat;
    }
  }

  // Strong gaze stabilizer (median + deadzone + OneEuro + lerp + clamp)
  class GazeStabilizer {
    constructor(el, opts = {}) {
      this.el = el;
      this.opts = Object.assign({
        medianWindow: 7,
        deadzone: 18,
        lerp: 0.12,
        maxStep: 40,
        minDelta: 0.5, // ignore micro-jitters (px)
        euro: { minCutoff: 0.5, beta: 0.02, dCutoff: 1.2 }
      }, opts);
      this.bufX = [];
      this.bufY = [];
      this.fx = new OneEuroFilter(this.opts.euro);
      this.fy = new OneEuroFilter(this.opts.euro);
      this.targetX = null;
      this.targetY = null;
      this.drawX = null;
      this.drawY = null;
      this.raf = null;
      this.hx = (this.el.offsetWidth || 14) / 2;
      this.hy = (this.el.offsetHeight || 14) / 2;
    }
    ingest(x, y, t = performance.now()) {
      // keep recent samples
      this.bufX.push(x); this.bufY.push(y);
      if (this.bufX.length > this.opts.medianWindow) { this.bufX.shift(); this.bufY.shift(); }
      const medX = this.#median(this.bufX);
      const medY = this.#median(this.bufY);

      const fx = this.fx.filter(medX, t);
      const fy = this.fy.filter(medY, t);

      if (this.targetX == null) {
        this.targetX = this.drawX = fx;
        this.targetY = this.drawY = fy;
        this.#apply(this.drawX, this.drawY);
        this.#tick();
        return;
      }

      // dead-zone and micro-jitter ignore
      const dx = fx - this.targetX, dy = fy - this.targetY;
      const d2 = dx*dx + dy*dy;
      if (d2 >= (this.opts.deadzone*this.opts.deadzone) || Math.hypot(dx,dy) > this.opts.minDelta) {
        this.targetX = fx;
        this.targetY = fy;
      }

      // clamp huge jumps per frame
      const jx = this.targetX - this.drawX, jy = this.targetY - this.drawY;
      const dist = Math.hypot(jx, jy);
      if (dist > this.opts.maxStep) {
        const r = this.opts.maxStep / Math.max(dist, 1);
        this.targetX = this.drawX + jx * r;
        this.targetY = this.drawY + jy * r;
      }

      if (!this.raf) this.#tick();
    }
    #tick() {
      this.raf = requestAnimationFrame(() => {
        this.drawX += (this.targetX - this.drawX) * this.opts.lerp;
        this.drawY += (this.targetY - this.drawY) * this.opts.lerp;
        this.#apply(this.drawX, this.drawY);
        this.#tick();
      });
    }
    #apply(x, y) {
      // viewport clamp to avoid edge flicker
      const cx = Math.max(this.hx, Math.min(window.innerWidth - this.hx, x));
      const cy = Math.max(this.hy, Math.min(window.innerHeight - this.hy, y));
      this.el.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    }
    #median(arr) {
      if (!arr.length) return 0;
      const a = arr.slice().sort((m,n)=>m-n), m = Math.floor(a.length/2);
      return a.length % 2 ? a[m] : (a[m-1]+a[m]) / 2;
    }
    stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; }
  }

  const state = {
    smooth: null,
    alpha: 0.18,
    prevTs: null,
    fixation: { radius: 55, minMs: 350, accMs: 0, anchor: null },
    debug: false,
    cameraOn: true,
    cooldownMs: 800,
    lastFixTs: 0
  };

  let stab = null;
  if (cursorEl) {
    cursorEl.style.pointerEvents = 'none';
    cursorEl.style.willChange = 'transform';
    stab = new GazeStabilizer(cursorEl, {
      medianWindow: 9,      // was 7
      deadzone: 22,         // was 18
      lerp: 0.08,           // was 0.12
      maxStep: 30,          // was 40
      euro: { minCutoff: 0.7, beta: 0.03, dCutoff: 1.4 } // stronger smoothing
    });
    window.ingestGaze = (x, y, t) => stab.ingest(x, y, t ?? performance.now());
  }

  if (window.webgazer && typeof window.webgazer.setGazeListener === 'function' && stab) {
    // Optional: turn off heavy overlays to reduce CPU jitter
    try {
      window.webgazer.showVideo(false).showFaceOverlay(false).showFaceFeedbackBox(false);
    } catch {}
    window.webgazer.setGazeListener((data, ts) => {
      if (!data || Number.isNaN(data.x) || Number.isNaN(data.y)) return;
      if (typeof data.confidence === 'number' && data.confidence < 0.45) return; // was 0.35 // gate noisy points
      // drop sub-pixel noise early
      if (stab.drawX != null && Math.hypot(data.x - stab.drawX, data.y - stab.drawY) < 0.4) return;
      stab.ingest(data.x, data.y, ts || performance.now());
    });
  }

  function updateCameraBtn() {
    if (!cameraBtn) return;
    cameraBtn.textContent = state.cameraOn ? 'Camera: On' : 'Camera: Off';
  }

  updateCameraBtn();
  if (debugToggle) debugToggle.onchange = () => { state.debug = !!debugToggle.checked; };

  // Build and run a click-based calibration (WebGazer learns from clicks)
  function buildCalibrationOverlay(overlay, hitsPerPoint = 5) {
    if (!overlay) return;
    overlay.innerHTML = '';
    overlay.classList.remove('hidden');

    // Ensure click listeners are active so WebGazer records training points
    try { window.webgazer?.addMouseEventListeners?.(); } catch {}

    const coords = [
      [0.10, 0.10], [0.50, 0.10], [0.90, 0.10],
      [0.10, 0.50], [0.50, 0.50], [0.90, 0.50],
      [0.10, 0.90], [0.50, 0.90], [0.90, 0.90],
    ];
    const needed = coords.length * hitsPerPoint;
    let total = 0;

    coords.forEach(([nx, ny]) => {
      const pt = document.createElement('div');
      pt.className = 'calib-pt';
      pt.style.position = 'absolute';
      pt.style.left = `${nx * 100}%`;
      pt.style.top = `${ny * 100}%`;
      pt.style.transform = 'translate(-50%, -50%)';

      let count = 0;
      pt.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Visual feedback
        pt.classList.add('hit');
        setTimeout(() => pt.classList.remove('hit'), 120);

        count += 1;
        total += 1;

        if (count >= hitsPerPoint) {
          pt.style.pointerEvents = 'none';
          pt.style.opacity = '0.35';
        }

        // Done: hide overlay and nudge WebGazer to retrain/apply
        if (total >= needed) {
          overlay.classList.add('hidden');
          try {
            // Brief pause/resume to ensure model picks up latest samples
            window.webgazer?.pause?.();
            setTimeout(() => window.webgazer?.resume?.(), 120);
          } catch {}
        }
      });

      overlay.appendChild(pt);
    });
  }

  // Public entry used by backend.html inline script
  window.initCalibration = function initCalibration(opts = {}) {
    // Optionally clear old data if requested by caller
    if (opts.reset) {
      try { window.webgazer?.clearData?.(); } catch {}
    }
    // Show overlay and start collecting calibration clicks
    if (overlayEl) {
      // Use 5 hits per point by default; override via opts.hits
      buildCalibrationOverlay(overlayEl, Math.max(3, opts.hits || 5));
    }
  };

  // Wire the toolbar button in case the inline script isn’t used
  if (calibrateBtn) {
    calibrateBtn.addEventListener('click', (e) => {
      e.preventDefault();
      // Clear old model and recalibrate fresh
      try { window.webgazer?.clearData?.(); } catch {}
      window.initCalibration({ reset: false, hits: 5 });
    });
  }

  // ...existing code...

  // Grab controls
  const gazeCursorEl = document.getElementById('gazeCursor');
  const calibrationOverlayEl = document.getElementById('calibrationOverlay');
  const cameraToggleBtn = document.getElementById('cameraToggleBtn');

  // Ensure gaze cursor starts hidden
  gazeCursorEl?.classList.add('hidden');

  // Remove any existing mousemove-driven cursor logic (if present). Make sure any code like:
  // window.addEventListener('mousemove', someHandlerThatMovesGazeCursor);
  // is deleted or disabled.

  // Smoothing for gaze updates
  let smoothed = { x: null, y: null };
  const alpha = 0.35; // 0..1, higher = snappier

  function setGazeCursor(x, y) {
    if (!gazeCursorEl) return;
    if (x == null || y == null) {
      gazeCursorEl.classList.add('hidden');
      return;
    }
    if (smoothed.x == null) {
      smoothed.x = x; smoothed.y = y;
    } else {
      smoothed.x += (x - smoothed.x) * alpha;
      smoothed.y += (y - smoothed.y) * alpha;
    }
    gazeCursorEl.style.left = `${smoothed.x}px`;
    gazeCursorEl.style.top = `${smoothed.y}px`;
    gazeCursorEl.classList.remove('hidden');
  }

  function hideGazeCursor() {
    gazeCursorEl?.classList.add('hidden');
    smoothed.x = smoothed.y = null;
  }

  // Start WebGazer and subscribe to predictions
  async function startWebGazer() {
    if (!window.webgazer) return;

    // Hide built-in visuals
    try {
      webgazer.showVideoPreview?.(false);
      webgazer.showVideo?.(false);
      webgazer.showFaceOverlay?.(false);
      webgazer.showFaceFeedbackBox?.(false);
      webgazer.showPredictionPoints?.(false);
      webgazer.showGazeDot?.(false);
    } catch {}

    webgazer
      .setRegression?.('ridge')
      ?.setTracker?.('clmtrackr')
      ?.setGazeListener((data) => {
        if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') {
          setGazeCursor(null, null);
          return;
        }
        setGazeCursor(data.x, data.y);
      });

    await webgazer.begin();
  }

  async function stopWebGazer() {
    try { await webgazer?.pause?.(); } catch {}
    hideGazeCursor();
  }

  // Build and run a click-based calibration grid
  function buildCalibrationOverlay(overlay, hitsPerPoint = 5) {
    if (!overlay) return;
    overlay.innerHTML = '';
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');

    // Ensure WebGazer records click samples
    try { window.webgazer?.addMouseEventListeners?.(); } catch {}

    const cells = [
      [0.10, 0.10], [0.50, 0.10], [0.90, 0.10],
      [0.10, 0.50], [0.50, 0.50], [0.90, 0.50],
      [0.10, 0.90], [0.50, 0.90], [0.90, 0.90],
    ];
    const needed = cells.length * hitsPerPoint;
    let total = 0;

    cells.forEach(([nx, ny]) => {
      const pt = document.createElement('div');
      pt.className = 'calib-pt';
      pt.style.position = 'absolute';
      pt.style.left = `${nx * 100}%`;
      pt.style.top = `${ny * 100}%`;
      pt.style.transform = 'translate(-50%, -50%)';

      let count = 0;
      pt.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        pt.classList.add('hit');
        setTimeout(() => pt.classList.remove('hit'), 100);

        count += 1;
        total += 1;

        if (count >= hitsPerPoint) {
          pt.style.pointerEvents = 'none';
          pt.style.opacity = '0.35';
        }

        if (total >= needed) {
          // Done: close overlay and nudge WebGazer to use the new model
          overlay.classList.add('hidden');
          overlay.setAttribute('aria-hidden', 'true');
          try {
            webgazer.pause?.();
            setTimeout(() => webgazer.resume?.(), 150);
          } catch {}
        }
      });

      overlay.appendChild(pt);
    });

    // Clicking outside a point shouldn’t close it
    overlay.addEventListener('click', (e) => e.stopPropagation(), { once: false });
  }

  // Public calibration entry
  window.initCalibration = function initCalibration(opts = {}) {
    if (opts.reset) {
      try { window.webgazer?.clearData?.(); } catch {}
    }
    if (calibrationOverlayEl) {
      buildCalibrationOverlay(calibrationOverlayEl, Math.max(3, opts.hits || 5));
    }
  };

  // Hook toolbar buttons
  calibrateBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    try { window.webgazer?.clearData?.(); } catch {}
    window.initCalibration({ reset: false, hits: 5 });
  });

  cameraToggleBtn?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const isOn = btn.getAttribute('aria-pressed') !== 'false';
    if (isOn) {
      btn.setAttribute('aria-pressed', 'false');
      btn.textContent = 'Turn Camera On';
      await stopWebGazer();
    } else {
      btn.setAttribute('aria-pressed', 'true');
      btn.textContent = 'Turn Camera Off';
      await startWebGazer();
    }
  });

  // Optional: hide gaze cursor when debug overlay is off (does not use mouse)
  debugToggle?.addEventListener('change', () => {
    // Ensure no mouse fallback is used anywhere; leave empty on purpose
  });

  // Boot
  startWebGazer().catch(console.error);

})();