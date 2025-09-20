/* ALS/Eye-Tracking Communicator
   - Eye tracking via WebGazer.js with dwell selection (bounded to Vocabulary grid)
   - Scanning fallback
   - Speech synthesis
   - Gemini Smart Compose (requires API key)
*/

(() => {
    const els = {
      tileGrid: document.getElementById('tileGrid'),
      categoryBar: document.getElementById('categoryBar'),
      chipContainer: document.getElementById('chipContainer'),
      messageInput: document.getElementById('messageInput'),
      aiSuggestions: document.getElementById('aiSuggestions'),
      historyList: document.getElementById('historyList'),
      gazePointer: document.getElementById('gazePointer'),
      statusLive: document.getElementById('statusLive'),
      // Toggles
      toggleEye: document.getElementById('toggleEye'),
      toggleScan: document.getElementById('toggleScan'),
      btnShowCategories: document.getElementById('btnShowCategories'),
      // Buttons
      btnSmartCompose: document.getElementById('btnSmartCompose'),
      btnSpeak: document.getElementById('btnSpeak'),
      btnStopSpeak: document.getElementById('btnStopSpeak'),
      btnUndo: document.getElementById('btnUndo'),
      btnClear: document.getElementById('btnClear'),
      btnCopy: document.getElementById('btnCopy'),
      // Settings
      settingsModal: document.getElementById('settingsModal'),
      btnSettings: document.getElementById('btnSettings'),
      closeSettings: document.getElementById('closeSettings'),
      cancelSettings: document.getElementById('cancelSettings'),
      saveSettings: document.getElementById('saveSettings'),
      fontSize: document.getElementById('fontSize'),
      fontSizeValue: document.getElementById('fontSizeValue'),
      toggleContrast: document.getElementById('toggleContrast'),
      dwellTime: document.getElementById('dwellTime'),
      dwellTimeValue: document.getElementById('dwellTimeValue'),
      toggleGazePointer: document.getElementById('toggleGazePointer'),
      toggleShowPreviewVideo: document.getElementById('toggleShowPreviewVideo'),
      scanSpeed: document.getElementById('scanSpeed'),
      scanSpeedValue: document.getElementById('scanSpeedValue'),
      voiceSelect: document.getElementById('voiceSelect'),
      geminiKey: document.getElementById('geminiKey'),
      toggleAutoSpeak: document.getElementById('toggleAutoSpeak'),
      // Help / Calibration
      helpModal: document.getElementById('helpModal'),
      btnHelp: document.getElementById('btnHelp'),
      closeHelp: document.getElementById('closeHelp'),
      doneHelp: document.getElementById('doneHelp'),
      calibrationArea: document.getElementById('calibrationArea'),
      resetCalibration: document.getElementById('resetCalibration'),
    };
  
    const SETTINGS_KEY = 'als-comm-settings-v1';
    const HISTORY_KEY = 'als-comm-history-v1';
  
    const defaultSettings = {
      eyeTrackingEnabled: false,
      dwellTimeMs: 1200,
      showGazePointer: true,
      showPreviewVideo: false,
      scanningEnabled: false,
      scanIntervalMs: 1200,
      fontSizePercent: 100,
      highContrast: false,
      voiceURI: '',
      autoSpeakAfterAI: false,
      geminiKey: '',
    };
    let settings = {...defaultSettings};
    let history = [];
    let voices = [];
    let vocabulary = [];
    let categories = [];
    let activeCategory = 'All';
  
    // Eye tracking states
    let gazeActive = false;
    let currentGazeTarget = null;
    let dwellAccum = 0;
    let lastT = performance.now();
    let lastGazeXY = null;
    let dwellTimerId = null;
  
    // Scanning
    let scanningTimer = null;
    let scanningIndex = 0;
    let currentTiles = [];
  
    // Composition
    let tokens = [];
  
    // Smooth gaze
    const smoothGaze = (prev, next, alpha = 0.2) => {
      if (!prev) return next;
      return {x: prev.x + alpha*(next.x - prev.x), y: prev.y + alpha*(next.y - prev.y)};
    };
  
    function saveSettings() {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }
    function loadSettings() {
      const s = localStorage.getItem(SETTINGS_KEY);
      settings = s ? {...defaultSettings, ...JSON.parse(s)} : {...defaultSettings};
      // apply
      document.body.classList.toggle('high-contrast', settings.highContrast);
      document.documentElement.style.setProperty('--font-scale', (settings.fontSizePercent/100).toString());
      els.toggleEye.checked = settings.eyeTrackingEnabled;
      els.toggleScan.checked = settings.scanningEnabled;
      els.fontSize.value = settings.fontSizePercent;
      els.fontSizeValue.textContent = settings.fontSizePercent;
      els.toggleContrast.checked = settings.highContrast;
      els.dwellTime.value = settings.dwellTimeMs;
      els.dwellTimeValue.textContent = settings.dwellTimeMs;
      els.toggleGazePointer.checked = settings.showGazePointer;
      els.toggleShowPreviewVideo.checked = settings.showPreviewVideo;
      els.scanSpeed.value = settings.scanIntervalMs;
      els.scanSpeedValue.textContent = settings.scanIntervalMs;
      els.geminiKey.value = settings.geminiKey || '';
      els.toggleAutoSpeak.checked = settings.autoSpeakAfterAI;
      setGazePointerVisibility(settings.showGazePointer);
    }
    function loadHistory(){
      const h = localStorage.getItem(HISTORY_KEY);
      history = h ? JSON.parse(h) : [];
      renderHistory();
    }
    function pushHistory(text){
      if (!text || !text.trim()) return;
      history.unshift({text, at: Date.now()});
      if (history.length > 30) history.pop();
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      renderHistory();
    }
    function renderHistory() {
      els.historyList.innerHTML = '';
      history.forEach((h, idx) => {
        const li = document.createElement('li');
        li.role = 'button';
        li.tabIndex = 0;
        li.textContent = h.text;
        li.title = new Date(h.at).toLocaleString();
        li.addEventListener('click', () => setMessage(h.text));
        li.addEventListener('keydown', (e)=>{ if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMessage(h.text); } });
        els.historyList.appendChild(li);
      });
    }
  
    // Vocabulary data
    function buildVocabulary(){
      const core = [
        {label:'Yes', emoji:'👍', kind:'yes', speak:'Yes', cats:['Core']},
        {label:'No', emoji:'👎', kind:'no', speak:'No', cats:['Core']},
        {label:'More', emoji:'➕', kind:'need', speak:'More', cats:['Core']},
        {label:'Stop', emoji:'🛑', kind:'action', speak:'Stop', cats:['Core']},
        {label:'Help', emoji:'🆘', kind:'need', speak:'I need help', cats:['Needs']},
        {label:'Bathroom', emoji:'🚻', kind:'need', speak:'I need the bathroom', cats:['Needs']},
        {label:'Pain', emoji:'🤕', kind:'feel', speak:'I am in pain', cats:['Feelings']},
        {label:'Hungry', emoji:'🍽️', kind:'need', speak:'I am hungry', cats:['Needs']},
        {label:'Thirsty', emoji:'🥤', kind:'need', speak:'I am thirsty', cats:['Needs']},
        {label:'Tired', emoji:'😴', kind:'feel', speak:'I am tired', cats:['Feelings']},
        {label:'Thank you', emoji:'🙏', kind:'action', speak:'Thank you', cats:['Core']},
        {label:'Please', emoji:'🤲', kind:'action', speak:'Please', cats:['Core']},
        {label:'Yes please', emoji:'✅', kind:'yes', speak:'Yes, please', cats:['Core']},
        {label:'No thanks', emoji:'❌', kind:'no', speak:'No, thank you', cats:['Core']},
        {label:'Cold', emoji:'🧊', kind:'feel', speak:'I feel cold', cats:['Feelings']},
        {label:'Hot', emoji:'🔥', kind:'feel', speak:'I feel hot', cats:['Feelings']},
      ];
      const people = [
        {label:'You', emoji:'🫵', kind:'people', speak:'you', cats:['People']},
        {label:'Me', emoji:'🙋', kind:'people', speak:'I', cats:['People']},
        {label:'Mom', emoji:'👩', kind:'people', speak:'Mom', cats:['People']},
        {label:'Dad', emoji:'👨', kind:'people', speak:'Dad', cats:['People']},
        {label:'Nurse', emoji:'🧑‍⚕️', kind:'people', speak:'nurse', cats:['People']},
        {label:'Doctor', emoji:'👩‍⚕️', kind:'people', speak:'doctor', cats:['People']},
      ];
      const actions = [
        {label:'Turn', emoji:'🔄', kind:'action', speak:'turn me', cats:['Actions']},
        {label:'Move', emoji:'📦', kind:'action', speak:'move me', cats:['Actions']},
        {label:'Adjust', emoji:'🎚️', kind:'action', speak:'adjust position', cats:['Actions']},
        {label:'Call', emoji:'📞', kind:'action', speak:'please call', cats:['Actions']},
        {label:'Water', emoji:'💧', kind:'action', speak:'water', cats:['Actions']},
        {label:'Blanket', emoji:'🛏️', kind:'action', speak:'blanket', cats:['Actions']},
      ];
      vocabulary = [...core, ...people, ...actions];
      const catSet = new Set(['All']);
      vocabulary.forEach(v => v.cats?.forEach(c => catSet.add(c)));
      categories = Array.from(catSet);
    }
  
    function renderCategories(){
      els.categoryBar.innerHTML = '';
      categories.forEach((c, idx) => {
        const btn = document.createElement('button');
        btn.className = 'category';
        btn.role = 'tab';
        btn.setAttribute('aria-selected', c === activeCategory ? 'true' : 'false');
        btn.textContent = c;
        btn.addEventListener('click', () => {
          activeCategory = c;
          renderCategories();
          renderTiles();
        });
        els.categoryBar.appendChild(btn);
      });
    }
  
    function renderTiles(){
      els.tileGrid.innerHTML = '';
      currentTiles = vocabulary
        .filter(v => activeCategory === 'All' || v.cats?.includes(activeCategory))
        .map((v, idx) => {
          const tile = document.createElement('button');
          tile.className = 'tile';
          tile.role = 'gridcell';
          tile.tabIndex = 0;
          tile.dataset.selectable = 'true';
          tile.dataset.kind = v.kind;
          tile.dataset.index = String(idx);
          tile.setAttribute('aria-label', `${v.label}`);
          tile.setAttribute('data-speak', v.speak);
          tile.innerHTML = `
            <div class="inner">
              <div class="emoji" aria-hidden="true">${v.emoji}</div>
              <div class="label">${v.label}</div>
            </div>
            <div class="dwell-ring" aria-hidden="true"></div>
          `;
          tile.addEventListener('click', () => activateTile(tile));
          tile.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activateTile(tile); }
          });
          els.tileGrid.appendChild(tile);
          return tile;
        });
    }
  
    function announce(msg){ els.statusLive.textContent = msg; }
  
    function addToken(label, speakText){
      tokens.push({label, speak: speakText || label});
      renderChips();
      updateMessageFromTokens();
    }
    function removeLastToken(){
      tokens.pop();
      renderChips();
      updateMessageFromTokens();
    }
    function clearTokens(){
      tokens = [];
      renderChips();
    }
    function renderChips(){
      els.chipContainer.innerHTML = '';
      tokens.forEach((t, i) => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.role = 'listitem';
        chip.innerHTML = `
          <span>${t.label}</span>
          <button class="remove" aria-label="Remove ${t.label}">&times;</button>
        `;
        chip.querySelector('.remove').addEventListener('click', () => {
          tokens.splice(i, 1);
          renderChips();
          updateMessageFromTokens();
        });
        els.chipContainer.appendChild(chip);
      });
    }
    function updateMessageFromTokens(){
      const text = tokens.map(t => t.speak || t.label).join(' ');
      if (!els.messageInput.dataset.userEdited) {
        els.messageInput.value = text;
      }
    }
    function setMessage(text){
      els.messageInput.value = text;
      els.messageInput.dataset.userEdited = 'true';
    }
  
    function activateTile(tile){
      const label = tile.querySelector('.label')?.textContent || '';
      const speakText = tile.getAttribute('data-speak') || label;
      addToken(label, speakText);
      tileAnimate(tile);
      annHighlight(tile);
    }
  
    function tileAnimate(tile){
      tile.style.transition = 'transform 100ms ease';
      tile.style.transform = 'scale(0.98)';
      setTimeout(()=> {
        tile.style.transform = '';
      }, 120);
    }
    function annHighlight(tile){
      const label = tile.querySelector('.label')?.textContent || '';
      announce(`Selected ${label}`);
    }
  
    // Keyboard navigation across grid
    function moveFocus(dx, dy){
      const tiles = Array.from(els.tileGrid.querySelectorAll('.tile'));
      if (!tiles.length) return;
      const cols = getGridColumns();
      let idx = document.activeElement?.classList?.contains('tile')
        ? tiles.indexOf(document.activeElement)
        : 0;
      if (idx < 0) idx = 0;
      let x = idx % cols;
      let y = Math.floor(idx / cols);
      x = clamp(x + dx, 0, cols - 1);
      const rows = Math.ceil(tiles.length / cols);
      y = clamp(y + dy, 0, rows - 1);
      let newIdx = y * cols + x;
      if (newIdx >= tiles.length) {
        newIdx = tiles.length - 1; // ragged last row
      }
      tiles[newIdx].focus();
    }
  
    // Robust column detection based on layout positions
    function getGridColumns(){
      const tiles = Array.from(els.tileGrid.querySelectorAll('.tile'));
      if (tiles.length <= 1) return tiles.length || 1;
      const firstTop = tiles[0].getBoundingClientRect().top;
      let cols = 0;
      for (const t of tiles) {
        const top = t.getBoundingClientRect().top;
        if (Math.abs(top - firstTop) < 1) cols++; else break;
      }
      return Math.max(1, cols);
    }
  
    function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
  
    // Helpers to bound gaze to Vocabulary grid
    function getGridRect(){ return els.tileGrid.getBoundingClientRect(); }
    function isInsideGrid(x, y){
      const r = getGridRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }
  
    // Speech
    function loadVoices(){
      voices = speechSynthesis.getVoices().filter(v => v.lang && !/^\s*$/.test(v.lang));
      els.voiceSelect.innerHTML = '';
      voices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.voiceURI;
        opt.textContent = `${v.name} — ${v.lang}${v.default ? ' (default)' : ''}`;
        if (settings.voiceURI && settings.voiceURI === v.voiceURI) opt.selected = true;
        els.voiceSelect.appendChild(opt);
      });
      if (!settings.voiceURI && voices.length){
        settings.voiceURI = voices.find(v => v.default)?.voiceURI || voices[0].voiceURI;
      }
    }
    function getSelectedVoice(){
      return voices.find(v => v.voiceURI === settings.voiceURI) || speechSynthesis.getVoices().find(v => v.default);
    }
    function speak(text){
      if (!text || !text.trim()) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = getSelectedVoice();
      if (v) u.voice = v;
      u.rate = 1;
      u.pitch = 1;
      speechSynthesis.speak(u);
    }
  
    // AI Smart Compose (Gemini)
    async function smartCompose(){
      const key = (els.geminiKey.value || settings.geminiKey || '').trim();
      if (!key) {
        toast('Add a Gemini API key in Settings to use Smart Compose.');
        return;
      }
      const base = 'https://generativelanguage.googleapis.com/v1beta';
      const model = 'gemini-1.5-flash';
      const prompt = buildComposePrompt();
      try {
        setAISuggestionsLoading(true);
        const res = await fetch(`${base}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
          method:'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [{text: prompt}]
            }],
            generationConfig: {
              temperature: 0.4,
              topP: 0.9,
              maxOutputTokens: 120,
            }
          })
        });
        if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
        const data = await res.json();
        const text = extractTextFromGemini(data);
        const suggestions = parseSuggestions(text);
        renderAISuggestions(suggestions);
        if (settings.autoSpeakAfterAI && suggestions[0]) {
          setMessage(suggestions[0]);
          speak(suggestions[0]);
          pushHistory(suggestions[0]);
        }
      } catch (e){
        console.error(e);
        toast('Smart Compose failed. Check API key or try again.');
        renderAISuggestions([]);
      } finally {
        setAISuggestionsLoading(false);
      }
    }
    function buildComposePrompt(){
      const raw = els.messageInput.value.trim();
      const words = tokens.map(t => t.speak || t.label);
      const context = raw || words.join(' ');
      return [
        'You are assisting a non-verbal user who selects short words/phrases.',
        'Turn their selection into 3 clear, friendly sentence options suitable for text-to-speech.',
        'Keep sentences short and natural. Use first person when appropriate.',
        'Output as a simple list with each sentence on its own line. No numbering.',
        '',
        `Selection: "${context}"`
      ].join('\n');
    }
    function extractTextFromGemini(resp){
      const cands = resp?.candidates || [];
      const parts = cands[0]?.content?.parts || [];
      const t = parts.map(p => p.text).filter(Boolean).join('\n');
      return t || '';
    }
    function parseSuggestions(text){
      const lines = text.split('\n').map(l => l.replace(/^\s*[-*•\d.]+\s*/, '').trim()).filter(Boolean);
      const uniq = Array.from(new Set(lines));
      return uniq.slice(0, 3);
    }
    function setAISuggestionsLoading(isLoading){
      els.aiSuggestions.innerHTML = isLoading ? '<div class="ai-suggestion">Thinking…</div>' : '';
    }
    function renderAISuggestions(items){
      els.aiSuggestions.innerHTML = '';
      items.forEach(s => {
        const b = document.createElement('button');
        b.className = 'ai-suggestion';
        b.textContent = s;
        b.addEventListener('click', () => {
          setMessage(s);
          if (settings.autoSpeakAfterAI) {
            speak(s);
            pushHistory(s);
          }
        });
        els.aiSuggestions.appendChild(b);
      });
      if (!items.length) {
        const small = document.createElement('small');
        small.textContent = 'No suggestions.';
        small.style.color = '#a6b1c9';
        els.aiSuggestions.appendChild(small);
      }
    }
  
    // UI helpers
    function toast(msg){
      announce(msg);
    }
  
    // Eye Tracking
    async function enableGaze(){
      if (gazeActive) return;
      try {
        webgazer.setGazeListener(onGaze)
          .showPredictionPoints(false)
          .setRegression('ridge')
          .begin();
        if (!settings.showPreviewVideo) {
          hideWebGazerVideo();
        } else {
          showWebGazerVideo();
        }
        gazeActive = true;
        setGazePointerVisibility(settings.showGazePointer);
        toast('Eye tracking enabled');
        loopDwell();
      } catch (e) {
        console.error(e);
        toast('Failed to start eye tracking.');
        settings.eyeTrackingEnabled = false;
        els.toggleEye.checked = false;
        saveSettings();
      }
    }
    function disableGaze(){
      if (!gazeActive) return;
      try { webgazer.pause(); } catch {}
      gazeActive = false;
      setGazePointerVisibility(false);
      stopDwell();
      toast('Eye tracking disabled');
    }
  
    // Update pointer; hide outside grid
    function onGaze(data){
      if (!data) return;
      lastGazeXY = smoothGaze(lastGazeXY, {x: data.x, y: data.y}, 0.25);
      updateGazePointer(lastGazeXY.x, lastGazeXY.y);
    }
    function updateGazePointer(x, y){
      const inside = isInsideGrid(x, y);
      if (settings.showGazePointer && inside) {
        els.gazePointer.style.display = 'block';
        els.gazePointer.style.left = `${x}px`;
        els.gazePointer.style.top = `${y}px`;
      } else {
        els.gazePointer.style.display = 'none';
      }
    }
    function setGazePointerVisibility(v){
      // Visibility also depends on being inside grid; this sets the baseline
      els.gazePointer.style.display = v ? 'block' : 'none';
    }
  
    function loopDwell(){
      cancelAnimationFrame(dwellTimerId);
      lastT = performance.now();
      const step = (t) => {
        const dt = Math.min(100, t - lastT);
        lastT = t;
        if (gazeActive && lastGazeXY) {
          handleDwell(lastGazeXY.x, lastGazeXY.y, dt);
        }
        dwellTimerId = requestAnimationFrame(step);
      };
      dwellTimerId = requestAnimationFrame(step);
    }
    function stopDwell(){
      cancelAnimationFrame(dwellTimerId);
      dwellTimerId = null;
      resetDwellUI();
    }
  
    // Only allow dwell selection when gaze is inside the Vocabulary grid
    function handleDwell(x, y, dt){
      if (settings.scanningEnabled) return; // avoid conflicts with scanning
      if (!isInsideGrid(x, y)) {
        resetDwellUI();
        return;
      }
      const el = document.elementFromPoint(Math.round(x), Math.round(y));
      const tile = el?.closest?.('.tile');
      const dwellMs = settings.dwellTimeMs;
  
      if (tile && tile.dataset.selectable) {
        if (currentGazeTarget !== tile) {
          resetDwellUI();
          currentGazeTarget = tile;
          dwellAccum = 0;
        } else {
          dwellAccum += dt;
        }
        const frac = Math.min(1, dwellAccum / dwellMs);
        setTileDwellProgress(tile, frac);
        if (frac >= 1) {
          activateTile(tile);
          dwellAccum = -999999; // require look-away
        }
      } else {
        resetDwellUI();
      }
    }
    function setTileDwellProgress(tile, frac){
      const ring = tile.querySelector('.dwell-ring');
      tile.setAttribute('data-dwell', 'active');
      ring.style.setProperty('--p', `${Math.max(0, Math.min(1, frac)) * 100}%`);
    }
    function resetDwellUI(){
      if (currentGazeTarget) {
        currentGazeTarget.removeAttribute('data-dwell');
        const ring = currentGazeTarget.querySelector('.dwell-ring');
        if (ring) ring.style.removeProperty('--p');
      }
      currentGazeTarget = null;
      dwellAccum = 0;
    }
    function hideWebGazerVideo(){
      const video = document.getElementById('webgazerVideoFeed');
      const overlay = document.getElementById('webgazerVideoCanvas');
      const faceOverlay = document.getElementById('webgazerFaceOverlay');
      const faceFeedbackBox = document.getElementById('webgazerFaceFeedbackBox');
      [video, overlay, faceOverlay, faceFeedbackBox].forEach(el => { if (el) el.style.display = 'none'; });
    }
    function showWebGazerVideo(){
      const video = document.getElementById('webgazerVideoFeed');
      if (video) video.style.display = 'block';
      const overlay = document.getElementById('webgazerVideoCanvas');
      if (overlay) overlay.style.display = 'block';
      const faceOverlay = document.getElementById('webgazerFaceOverlay');
      if (faceOverlay) faceOverlay.style.display = 'block';
      const faceFeedbackBox = document.getElementById('webgazerFaceFeedbackBox');
      if (faceFeedbackBox) faceFeedbackBox.style.display = 'block';
    }
  
    // Scanning Mode
    function startScanning(){
      stopScanning();
      const tiles = Array.from(els.tileGrid.querySelectorAll('.tile'));
      if (!tiles.length) return;
      scanningIndex = -1;
      scanningTimer = setInterval(() => {
        scanningHighlightNext();
      }, settings.scanIntervalMs);
      toast('Scanning enabled');
    }
    function stopScanning(){
      if (scanningTimer) clearInterval(scanningTimer);
      scanningTimer = null;
      clearScanningHighlight();
      toast('Scanning disabled');
    }
    function scanningHighlightNext(){
      const tiles = Array.from(els.tileGrid.querySelectorAll('.tile'));
      if (!tiles.length) return;
      clearScanningHighlight();
      scanningIndex = (scanningIndex + 1) % tiles.length;
      const tile = tiles[scanningIndex];
      tile.focus();
      tile.setAttribute('data-dwell', 'active');
      const ring = tile.querySelector('.dwell-ring');
      ring && (ring.style.setProperty('--p', '100%'));
    }
    function clearScanningHighlight(){
      const prev = els.tileGrid.querySelector('.tile[data-dwell="active"]');
      if (prev) {
        prev.removeAttribute('data-dwell');
        const ring = prev.querySelector('.dwell-ring');
        ring && ring.style.removeProperty('--p');
      }
    }
  
    // Modals
    function openModal(modal){
      modal.hidden = false;
    }
    function closeModal(modal){
      modal.hidden = true;
    }
  
    // Calibration dots
    function buildCalibrationDots(){
      els.calibrationArea.innerHTML = '';
      const grid = [
        [5,5],[50,5],[95,5],
        [5,50],[50,50],[95,50],
        [5,95],[50,95],[95,95],
      ];
      grid.forEach((pos) => {
        const dot = document.createElement('button');
        dot.className = 'calib-dot';
        dot.style.left = pos[0] + '%';
        dot.style.top = pos[1] + '%';
        dot.title = 'Click 3 times while looking here';
        dot.dataset.count = '0';
        dot.addEventListener('click', () => {
          const n = parseInt(dot.dataset.count || '0', 10) + 1;
          dot.dataset.count = String(n);
          if (n >= 3) dot.classList.add('done');
        });
        els.calibrationArea.appendChild(dot);
      });
    }
    function resetCalibrationDots(){
      els.calibrationArea.querySelectorAll('.calib-dot').forEach(dot => {
        dot.dataset.count = '0';
        dot.classList.remove('done');
      });
    }
  
    // Event wiring
    function wireEvents(){
      // Toolbar toggles
      els.toggleEye.addEventListener('change', (e) => {
        settings.eyeTrackingEnabled = e.target.checked;
        saveSettings();
        if (settings.eyeTrackingEnabled) enableGaze(); else disableGaze();
      });
      els.toggleScan.addEventListener('change', (e) => {
        settings.scanningEnabled = e.target.checked;
        saveSettings();
        if (settings.scanningEnabled) startScanning(); else stopScanning();
      });
      els.btnShowCategories.addEventListener('click', () => {
        const expanded = els.btnShowCategories.getAttribute('aria-expanded') === 'true';
        els.btnShowCategories.setAttribute('aria-expanded', String(!expanded));
        els.categoryBar.style.display = expanded ? 'none' : 'flex';
      });
  
      // Compose actions
      els.btnSmartCompose.addEventListener('click', smartCompose);
      els.btnSpeak.addEventListener('click', () => {
        const text = els.messageInput.value.trim();
        if (text) {
          speak(text);
          pushHistory(text);
        }
      });
      els.btnStopSpeak.addEventListener('click', () => speechSynthesis.cancel());
      els.btnUndo.addEventListener('click', removeLastToken);
      els.btnClear.addEventListener('click', () => { clearTokens(); els.messageInput.value=''; });
      els.btnCopy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(els.messageInput.value);
          toast('Copied to clipboard');
        } catch { toast('Copy failed'); }
      });
      els.messageInput.addEventListener('input', () => {
        els.messageInput.dataset.userEdited = 'true';
      });
  
      // Settings
      els.btnSettings.addEventListener('click', () => openModal(els.settingsModal));
      els.closeSettings.addEventListener('click', () => closeModal(els.settingsModal));
      els.cancelSettings.addEventListener('click', () => { loadSettings(); closeModal(els.settingsModal); });
      els.saveSettings.addEventListener('click', () => {
        settings.fontSizePercent = parseInt(els.fontSize.value, 10);
        settings.highContrast = !!els.toggleContrast.checked;
        settings.dwellTimeMs = parseInt(els.dwellTime.value, 10);
        settings.showGazePointer = !!els.toggleGazePointer.checked;
        settings.showPreviewVideo = !!els.toggleShowPreviewVideo.checked;
        settings.scanIntervalMs = parseInt(els.scanSpeed.value, 10);
        settings.voiceURI = els.voiceSelect.value;
        settings.geminiKey = els.geminiKey.value.trim();
        settings.autoSpeakAfterAI = !!els.toggleAutoSpeak.checked;
  
        document.body.classList.toggle('high-contrast', settings.highContrast);
        document.documentElement.style.setProperty('--font-scale', (settings.fontSizePercent/100).toString());
  
        if (gazeActive) {
          if (settings.showPreviewVideo) showWebGazerVideo(); else hideWebGazerVideo();
        }
        // Force pointer update based on new visibility preference
        if (lastGazeXY) updateGazePointer(lastGazeXY.x, lastGazeXY.y);
  
        saveSettings();
        closeModal(els.settingsModal);
        toast('Settings saved');
      });
  
      els.fontSize.addEventListener('input', () => els.fontSizeValue.textContent = els.fontSize.value);
      els.dwellTime.addEventListener('input', () => els.dwellTimeValue.textContent = els.dwellTime.value);
      els.scanSpeed.addEventListener('input', () => els.scanSpeedValue.textContent = els.scanSpeed.value);
  
      // Help / Calibration
      els.btnHelp.addEventListener('click', () => {
        openModal(els.helpModal);
        buildCalibrationDots();
      });
      els.closeHelp.addEventListener('click', () => closeModal(els.helpModal));
      els.doneHelp.addEventListener('click', () => closeModal(els.helpModal));
      els.resetCalibration.addEventListener('click', () => resetCalibrationDots());
  
      // Keyboard
      document.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        switch (e.key) {
          case 'ArrowRight': e.preventDefault(); moveFocus(1, 0); break;
          case 'ArrowLeft': e.preventDefault(); moveFocus(-1, 0); break;
          case 'ArrowDown': e.preventDefault(); moveFocus(0, 1); break;
          case 'ArrowUp': e.preventDefault(); moveFocus(0, -1); break;
          case 's': case 'S': e.preventDefault(); els.btnSpeak.click(); break;
          case 'c': case 'C': e.preventDefault(); els.btnClear.click(); break;
          case 'u': case 'U': e.preventDefault(); els.btnUndo.click(); break;
          case 'h': case 'H': e.preventDefault(); els.btnHelp.click(); break;
          case 'g': case 'G':
            e.preventDefault();
            els.toggleEye.checked = !els.toggleEye.checked;
            els.toggleEye.dispatchEvent(new Event('change'));
            break;
          default: break;
        }
      });
  
      // Scanning selection by space/enter
      document.addEventListener('keydown', (e) => {
        if (!settings.scanningEnabled) return;
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          const tile = document.activeElement?.closest('.tile');
          if (tile) activateTile(tile);
        }
      });
  
      // Voice change
      els.voiceSelect.addEventListener('change', () => {
        settings.voiceURI = els.voiceSelect.value;
        saveSettings();
      });
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        loadVoices();
      });
  
      // Keep bounding accurate on resize/scroll
      window.addEventListener('resize', () => {
        if (lastGazeXY) updateGazePointer(lastGazeXY.x, lastGazeXY.y);
      });
      window.addEventListener('scroll', () => {
        if (lastGazeXY) updateGazePointer(lastGazeXY.x, lastGazeXY.y);
      }, {passive:true});
    }
  
    // Init
    function init(){
      buildVocabulary();
      renderCategories();
      renderTiles();
      loadSettings();
      loadHistory();
      wireEvents();
      loadVoices();
  
      if (settings.eyeTrackingEnabled) enableGaze();
      if (settings.scanningEnabled) startScanning();
    }
  
    init();
  
  })();