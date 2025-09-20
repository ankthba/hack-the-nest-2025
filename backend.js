// =======================
// CONFIG
// =======================
const words = [
    "I", "need", "help", "food",
    "water", "bathroom", "pain", "yes",
    "no", "thank you", "hello", "goodbye",
    "family", "friend", "doctor", "nurse"
];

// =======================
// DOM ELEMENTS
// =======================
const grid = document.getElementById("word-grid");
const message = document.getElementById("message");
const webcam = document.getElementById("webcam");
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("start-head-tracking");
const stopBtn = document.getElementById("stop-head-tracking");
const generateBtn = document.getElementById("generate-message");
const speakBtn = document.getElementById("speak-message");
const geminiKeyInput = document.getElementById("gemini-key");

// =======================
// WORD GRID SETUP
// =======================
function createWordGrid() {
    grid.innerHTML = "";
    words.forEach((word, idx) => {
        const div = document.createElement("div");
        div.className = "word-item";
        div.textContent = word;
        div.dataset.index = idx;
        div.onclick = () => selectWord(div, word);
        grid.appendChild(div);
    });
}
let selectedWords = [];
function selectWord(div, word) {
    if (div.classList.contains("selected")) {
        div.classList.remove("selected");
        selectedWords = selectedWords.filter(w => w !== word);
    } else {
        div.classList.add("selected");
        selectedWords.push(word);
    }
    message.value = "";
}

// =======================
// HEAD TRACKING (WebGazer Nose + Debug)
// =======================

let headTrackingActive = false;
let headTrackingInterval = null;
let dwellTimers = {};

// Anti-jitter config (more aggressive)
const HT_CFG = {
    sampleMs: 50,           // ~20 FPS processing
    medianWindow: 7,        // rolling median window size
    minMovePx: 12,          // ignore tiny movements (dead zone)
    breakoutPx: 60,         // cancel dwell if large motion occurs
    dwellMs: 750,           // dwell before select
    snapRadius: 42,         // start snapping to word center within this radius
    snapRelease: 68,        // release snap if cursor exceeds this distance
    euro: {                 // One Euro filter parameters
        minCutoff: 1.2,
        beta: 0.0025,
        dCutoff: 1.0
    }
};

// Ensure overlay doesn’t block hit-testing
try { if (overlay) overlay.style.pointerEvents = "none"; } catch {}

// Overlay drawing
let overlayCtx = null;
function initOverlay() {
    if (!overlay) return;
    overlayCtx = overlay.getContext("2d");
    const resize = () => {
        overlay.width = overlay.clientWidth || window.innerWidth;
        overlay.height = overlay.clientHeight || window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
}
initOverlay();

function drawCursor(x, y) {
    if (!overlayCtx) return;
    const ctx = overlayCtx;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 150, 255, 0.28)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 150, 255, 0.95)";
    ctx.fill();
}

// ---------- One Euro filter + median ----------
function alphaFromCutoff(cutoff, dt) {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
}
class LowPass {
    constructor() { this.y = null; this.s = false; }
    filter(x, a) {
        if (!this.s) { this.s = true; this.y = x; return x; }
        this.y = a * x + (1 - a) * this.y;
        return this.y;
    }
}
class OneEuro1D {
    constructor({ minCutoff, beta, dCutoff }) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
        this.xf = new LowPass();
        this.dxf = new LowPass();
        this.prev = null;
    }
    filter(x, dt) {
        const dx = (this.prev == null) ? 0 : (x - this.prev) / dt;
        const edx = this.dxf.filter(dx, alphaFromCutoff(this.dCutoff, dt));
        const cutoff = this.minCutoff + this.beta * Math.abs(edx);
        const result = this.xf.filter(x, alphaFromCutoff(cutoff, dt));
        this.prev = result;
        return result;
    }
}

function makeSmoother({ medianWindow, euro }) {
    const hx = [];
    const hy = [];
    const ex = new OneEuro1D(euro);
    const ey = new OneEuro1D(euro);

    function median(arr) {
        if (!arr.length) return null;
        const c = arr.slice().sort((a, b) => a - b);
        const m = Math.floor(c.length / 2);
        return c.length % 2 ? c[m] : (c[m - 1] + c[m]) / 2;
    }

    return {
        push(pt, dt) {
            hx.push(pt.x); hy.push(pt.y);
            if (hx.length > medianWindow) hx.shift();
            if (hy.length > medianWindow) hy.shift();
            const mx = median(hx), my = median(hy);
            if (mx == null || my == null) return null;
            return { x: ex.filter(mx, dt), y: ey.filter(my, dt) };
        }
    };
}
const smoother = makeSmoother(HT_CFG);

// ---------- Snap-to-center with hysteresis ----------
let snapEl = null;
function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
function applySnap(pt) {
    const under = document.elementFromPoint(pt.x, pt.y);
    const candidate = (under && under.classList && under.classList.contains("word-item")) ? under : null;

    // Maintain snap if still near current element
    if (snapEl) {
        const c = centerOf(snapEl);
        const dx = pt.x - c.x, dy = pt.y - c.y;
        const d2 = dx*dx + dy*dy;
        if (d2 <= HT_CFG.snapRelease * HT_CFG.snapRelease) {
            return { pt: { x: c.x, y: c.y }, el: snapEl };
        } else {
            snapEl = null; // release
        }
    }

    // Acquire new snap
    if (candidate) {
        const c = centerOf(candidate);
        const dx = pt.x - c.x, dy = pt.y - c.y;
        const d2 = dx*dx + dy*dy;
        if (d2 <= HT_CFG.snapRadius * HT_CFG.snapRadius) {
            snapEl = candidate;
            return { pt: { x: c.x, y: c.y }, el: candidate };
        }
    }

    // No snap
    return { pt, el: candidate };
}

// ---------- Hover/dwell handling ----------
let currentHoverEl = null;
let hoverStartPoint = null;
let hoverTimer = null;

function clearHoverTimer() {
    if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
    }
}
function setHover(el, pt) {
    currentHoverEl = el;
    hoverStartPoint = { x: pt.x, y: pt.y };
    clearHoverTimer();

    if (el && el.classList && el.classList.contains("word-item")) {
        el.classList.add("hover");
        hoverTimer = setTimeout(() => {
            selectWord(el, el.textContent);
            el.classList.remove("hover");
            clearHoverTimer();
        }, HT_CFG.dwellMs);
    }
}
function updateHover(el, pt) {
    if (el !== currentHoverEl) {
        if (currentHoverEl && currentHoverEl.classList) currentHoverEl.classList.remove("hover");
        setHover(el, pt);
        return;
    }
    if (!currentHoverEl) return;

    // Cancel dwell if large motion
    const dx = pt.x - hoverStartPoint.x, dy = pt.y - hoverStartPoint.y;
    if ((dx*dx + dy*dy) > HT_CFG.breakoutPx * HT_CFG.breakoutPx) {
        if (currentHoverEl && currentHoverEl.classList) currentHoverEl.classList.remove("hover");
        setHover(el, pt);
    }
}

// ---------- Processing loop ----------
let lastRaw = null;
let lastTs = null;
let lastDrawn = { x: 0, y: 0 };

function clampToViewport(pt) {
    const w = overlay ? overlay.width : window.innerWidth;
    const h = overlay ? overlay.height : window.innerHeight;
    return {
        x: Math.max(0, Math.min(w - 1, pt.x)),
        y: Math.max(0, Math.min(h - 1, pt.y))
    };
}

function processFrame() {
    if (!headTrackingActive || !lastRaw) return;

    const nowTs = lastRaw.t || performance.now();
    let dt = lastTs ? Math.max(0.001, (nowTs - lastTs) / 1000) : HT_CFG.sampleMs / 1000;
    lastTs = nowTs;

    const clamped = clampToViewport(lastRaw);
    const sm = smoother.push(clamped, dt);
    if (!sm) return;

    // Snap to center to kill hover jitter
    const { pt: stablePt, el: hoverEl } = applySnap(sm);

    // Dead-zone to avoid redraw churn
    const ddx = stablePt.x - lastDrawn.x, ddy = stablePt.y - lastDrawn.y;
    if ((ddx*ddx + ddy*ddy) >= HT_CFG.minMovePx * HT_CFG.minMovePx) {
        lastDrawn = stablePt;
        drawCursor(stablePt.x, stablePt.y);
    }

    updateHover(hoverEl || document.elementFromPoint(stablePt.x, stablePt.y), stablePt);
}

function startHeadTracking() {
    if (headTrackingActive) return;
    if (!window.webgazer) {
        console.warn("webgazer not found. Include the library before starting head tracking.");
        return;
    }
    headTrackingActive = true;

    webgazer
        .setRegression("ridge")
        .setTracker("clmtrackr")
        .showVideo(false)
        .showFaceOverlay(false)
        .showFaceFeedbackBox(false)
        .showPredictionPoints(false)
        .setGazeListener((data, ts) => {
            if (!data) return;
            // Ignore obviously invalid points
            if (!Number.isFinite(data.x) || !Number.isFinite(data.y)) return;
            lastRaw = { x: data.x, y: data.y, t: ts || performance.now() };
        });

    webgazer.begin();
    headTrackingInterval = setInterval(processFrame, HT_CFG.sampleMs);
}

function stopHeadTracking() {
    if (!headTrackingActive) return;
    headTrackingActive = false;

    clearHoverTimer();
    if (currentHoverEl && currentHoverEl.classList) currentHoverEl.classList.remove("hover");
    currentHoverEl = null;
    hoverStartPoint = null;
    snapEl = null;

    if (headTrackingInterval) {
        clearInterval(headTrackingInterval);
        headTrackingInterval = null;
    }
    if (overlayCtx) overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

    try { webgazer && webgazer.clearGazeListener(); } catch {}
    try { webgazer && webgazer.end(); } catch {}
}

// Wire buttons
if (startBtn) startBtn.addEventListener("click", startHeadTracking);
if (stopBtn) stopBtn.addEventListener("click", stopHeadTracking);

// =======================
// HEAD TRACKING UI + DWELL CLICK
// =======================
(function () {
    const cursorEl = document.getElementById('head-cursor');
    const ringEl = document.getElementById('dwell-ring');
    const startBtn = document.getElementById('start-head-tracking');
    const stopBtn = document.getElementById('stop-head-tracking');

    if (!cursorEl || !ringEl || !startBtn || !stopBtn) return;

    let enabled = false;
    let gazeListenerSet = false;

    // Unmirror X to match mirrored webcam preview
    const MIRROR_X = true;

    let last = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    let smooth = { x: last.x, y: last.y };
    // Lower smoothing to reduce lag (set to 1 for no smoothing)
    const alpha = 0.8;
    let dwellStart = 0;
    let dwellTarget = null;
    const DWELL_MS = 800;
    let cooldownUntil = 0;
    const COOLDOWN_MS = 600;

    function setEnabled(on) {
        if (on === enabled) return;
        enabled = on;
        startBtn.style.display = enabled ? 'none' : '';
        stopBtn.style.display = enabled ? '' : 'none';
        if (enabled) start();
        else stop();
    }

    function start() {
        try {
            // Reduce built-in latency
            if (webgazer.params) webgazer.params.applyKalmanFilter = false;

            // Hide WebGazer's default overlays
            webgazer.showVideoPreview(false)
                    .showPredictionPoints(false)
                    .showFaceFeedbackBox(false);
        } catch {}

        cursorEl.style.opacity = '1';
        ringEl.style.opacity = '0';

        if (!gazeListenerSet) {
            webgazer.setGazeListener(onGaze);
            gazeListenerSet = true;
        }
        // Begin or resume
        if (webgazer.isReady && webgazer.isReady()) {
            try { webgazer.resume(); } catch { webgazer.begin(); }
        } else {
            webgazer.begin().catch(err => {
                console.error('WebGazer init failed', err);
                alert('Enable camera permissions in your browser and reload.');
                setEnabled(false);
            });
        }
        try { webgazer.saveDataAcrossSessions(true); } catch {}
    }

    function stop() {
        cursorEl.style.opacity = '0';
        ringEl.style.opacity = '0';
        try { webgazer.pause(); } catch {}
    }

    function onGaze(data /* {x,y} */, ts) {
        if (!enabled) return;
        if (!data) {
            cursorEl.style.opacity = '0.2'; // indicate lost tracking
            return;
        }
        cursorEl.style.opacity = '1';
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Unmirror horizontally and clamp
        const gx = MIRROR_X ? (vw - data.x) : data.x;
        const gy = data.y;

        last.x = Math.max(0, Math.min(vw, gx));
        last.y = Math.max(0, Math.min(vh, gy));

        // Smooth with low latency
        smooth.x = smooth.x + alpha * (last.x - smooth.x);
        smooth.y = smooth.y + alpha * (last.y - smooth.y);

        // Move cursor (GPU-friendly)
        cursorEl.style.transform = `translate3d(${smooth.x}px, ${smooth.y}px, 0)`;

        // Dwell-to-click
        const now = performance.now();
        const el = document.elementFromPoint(smooth.x, smooth.y);
        const target = pickClickable(el);

        if (!target) {
            dwellTarget = null;
            ringEl.style.opacity = '0';
            return;
        }

        if (target !== dwellTarget) {
            dwellTarget = target;
            dwellStart = now;
            ringEl.style.opacity = '1';
        }

        // Update dwell ring around cursor
        const pct = Math.min(1, (now - dwellStart) / DWELL_MS);
        const ringScale = 1 + 0.6 * (1 - pct);
        ringEl.style.transform = `translate3d(${smooth.x}px, ${smooth.y}px, 0) scale(${ringScale})`;
        ringEl.style.borderColor = pct > 0.5 ? '#30d158' : '#34c759';

        if (pct >= 1 && now >= cooldownUntil) {
            fireClick(dwellTarget, smooth.x, smooth.y);
            cooldownUntil = now + COOLDOWN_MS;
            dwellStart = now; // restart dwell on same element
        }
    }

    function pickClickable(el) {
        let cur = el;
        while (cur && cur !== document.body) {
            const tag = (cur.tagName || '').toLowerCase();
            const role = (cur.getAttribute && cur.getAttribute('role')) || '';
            if (cur.onclick || cur.href || cur.tabIndex >= 0 ||
                ['button', 'a', 'input', 'textarea', 'select', 'summary', 'label'].includes(tag) ||
                ['button', 'link', 'checkbox', 'menuitem', 'tab', 'switch'].includes(role)) {
                return cur;
            }
            cur = cur.parentElement;
        }
        return null;
    }

    function fireClick(el, x, y) {
        const rect = el.getBoundingClientRect();
        const cx = Math.max(rect.left, Math.min(rect.right - 1, x));
        const cy = Math.max(rect.top, Math.min(rect.bottom - 1, y));
        const opts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window };
        el.dispatchEvent(new MouseEvent('pointerdown', opts));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('pointerup', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
    }

    startBtn.addEventListener('click', () => setEnabled(true));
    stopBtn.addEventListener('click', () => setEnabled(false));
    window.addEventListener('blur', () => setEnabled(false));
    window.addEventListener('beforeunload', () => { try { webgazer.end(); } catch {} });
})();

// =======================
// GEMINI API INTEGRATION
// =======================

generateBtn.onclick = async function () {
    if (!selectedWords.length) {
        message.value = "Select words first.";
        return;
    }
    let apiKey = geminiKeyInput.value.trim();
    if (!apiKey) {
        alert("Please enter a Gemini API key.");
        return;
    }
    message.value = "Generating message...";
    let prompt = `Transform these words into a natural, expressive sentence for a non-verbal communicator: ${selectedWords.join(' ')}.`;
    // Call Gemini API (Google Generative Language API)
    try {
        let resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" + apiKey, {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });
        let data = await resp.json();
        if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            message.value = data.candidates[0].content.parts[0].text;
        } else {
            message.value = "Could not generate message.";
        }
    } catch (err) {
        message.value = "Gemini API error: " + err;
    }
};

// =======================
// SPEECH SYNTHESIS
// =======================
speakBtn.onclick = function () {
    let msg = message.value;
    if (msg && 'speechSynthesis' in window) {
        const utter = new window.SpeechSynthesisUtterance(msg);
        utter.lang = "en-US";
        window.speechSynthesis.speak(utter);
    }
};

// =======================
// INIT
// =======================
createWordGrid();