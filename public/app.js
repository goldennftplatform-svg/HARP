const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let projects = [], current = null, style = 'Cinematic', view = 'studio';
let context, masterGain, analyser, meterData, buffers = [], sources = [], live = [];
let playing = false, loading = false, offset = 0, started = 0, loop = false, loadVersion = 0;
let toastTimer;
const impulseCache = new Map();
let patternDirty = false, renderedPattern = null, seqPlayingStep = -1;
let separatorInfo = null;

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3600);
}

const HARP = (() => {
  const p = new URL(location.href);
  const fromUrl = p.searchParams.get('token');
  if (fromUrl) { try { localStorage.setItem('harp_access_token', fromUrl); } catch {} p.searchParams.delete('token'); history.replaceState(null, '', p.pathname + (p.searchParams.toString() ? '?' + p.searchParams.toString() : '') + p.hash); }
  let token = '';
  try { token = localStorage.getItem('harp_access_token') || ''; } catch {}
  return {
    token: () => { try { return localStorage.getItem('harp_access_token') || token || ''; } catch { return token || ''; } },
    setToken: t => { token = String(t || ''); try { token ? localStorage.setItem('harp_access_token', token) : localStorage.removeItem('harp_access_token'); } catch {} }
  };
})();

function withToken(url) {
  const tok = HARP.token();
  if (!tok || !url) return url;
  try {
    const u = new URL(url, location.origin);
    if (!u.searchParams.has('token')) u.searchParams.set('token', tok);
    return u.pathname + u.search + u.hash;
  } catch { return url; }
}

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const tok = HARP.token();
  if (tok && !headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + tok);
  const r = await fetch(url, { ...options, headers });
  const value = await r.json().catch(() => ({}));
  if (r.status === 401) {
    HARP.setToken('');
    throw Error(value.error || 'Unauthorized. Open with a valid access token or set HARP_ACCESS_TOKEN on the server.');
  }
  if (!r.ok) throw Error(value.error || 'Request failed');
  return value;
}

function dfx() { return { pan: 0, low: 0, high: 1, delay: 0, reverb: 0 }; }
function ensureFx(p) {
  if (!p) return p;
  const n = p.stems?.length || 0;
  if (!Array.isArray(p.fx) || p.fx.length !== n) p.fx = Array.from({ length: n }, (_, i) => ({ ...dfx(), ...(p.fx?.[i] || {}) }));
  p.fx = p.fx.map(f => ({
    pan: Math.max(-1, Math.min(1, +f.pan || 0)),
    low: Math.max(0, Math.min(1, +f.low || 0)),
    high: Math.max(0, Math.min(1, f.high ?? 1)),
    delay: Math.max(0, Math.min(1, +f.delay || 0)),
    reverb: Math.max(0, Math.min(1, +f.reverb || 0)),
  }));
  if (!Array.isArray(p.volumes) || p.volumes.length !== n) p.volumes = Array.from({ length: n }, (_, i) => p.volumes?.[i] ?? 0.8);
  if (!Array.isArray(p.mutes) || p.mutes.length !== n) p.mutes = Array.from({ length: n }, (_, i) => !!p.mutes?.[i]);
  if (!Array.isArray(p.solos) || p.solos.length !== n) p.solos = Array.from({ length: n }, (_, i) => !!p.solos?.[i]);
  return p;
}
function clonePattern(pat) {
  if (!pat || !pat.drums) return null;
  const lanes = ['kick', 'snare', 'hat'];
  const drums = {};
  for (const l of lanes) drums[l] = Array.isArray(pat.drums[l]) ? pat.drums[l].map(v => v ? 1 : 0) : [];
  return { version: 1, stepsPerBeat: pat.stepsPerBeat || 4, drums };
}
function patternsEqual(a, b) {
  if (!a || !b) return false;
  const lanes = ['kick', 'snare', 'hat'];
  for (const l of lanes) {
    const aa = a.drums?.[l] || [], bb = b.drums?.[l] || [];
    if (aa.length !== bb.length) return false;
    for (let i = 0; i < aa.length; i++) if (!!aa[i] !== !!bb[i]) return false;
  }
  return true;
}
function isEditableSketch(p) {
  return !!(p && !p.neural && !p.imported && p.pattern && p.pattern.drums && Array.isArray(p.stems) && p.stems.length === 4);
}
function anySolo(p = current) { return !!(p && (p.solos || []).some(Boolean)); }
function trackAudible(i, p = current) {
  if (!p) return false;
  const soloed = anySolo(p) ? !!p.solos?.[i] : true;
  return soloed && !p.mutes?.[i];
}
function effectiveGain(i, p = current) { return trackAudible(i, p) ? (p.volumes?.[i] ?? 0.8) : 0; }

function audioContext() {
  if (!context) {
    context = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = context.createGain();
    masterGain.gain.value = Number($('#master').value || 0.8);
    try {
      analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.6;
      meterData = new Float32Array(analyser.fftSize);
      masterGain.connect(analyser);
      analyser.connect(context.destination);
    } catch {
      analyser = null; meterData = null;
      masterGain.connect(context.destination);
    }
  }
  return context;
}

function fmt(t) {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  if (m >= 60) { const h = Math.floor(m / 60); return `${h}:${String(m % 60).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
  return `${m}:${String(s).padStart(2, '0')}`;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function time() { return playing && context ? offset + context.currentTime - started : offset; }

function impulse(ctx) {
  const rate = ctx.sampleRate || 44100;
  if (impulseCache.has(rate)) return impulseCache.get(rate);
  const len = Math.floor(rate * 1.8);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
  }
  impulseCache.set(rate, buf);
  return buf;
}

function applyFx(nodes, fx) {
  if (!nodes || !fx) return;
  const pan = Math.max(-1, Math.min(1, +fx.pan || 0));
  const low = (Math.max(0, Math.min(1, +fx.low || 0)) - 0) * 18; // 0..18 dB boost
  const high = (Math.max(0, Math.min(1, fx.high ?? 1)) - 0.5) * 24; // -12..12 dB
  const delayMix = Math.max(0, Math.min(1, +fx.delay || 0));
  const revMix = Math.max(0, Math.min(1, +fx.reverb || 0));
  if (nodes.panner) nodes.panner.pan.value = pan;
  if (nodes.low) { nodes.low.type = 'lowshelf'; nodes.low.frequency.value = 220; nodes.low.gain.value = low; }
  if (nodes.high) { nodes.high.type = 'highshelf'; nodes.high.frequency.value = 3600; nodes.high.gain.value = high; }
  if (nodes.delaySend) nodes.delaySend.gain.value = delayMix * 0.45;
  if (nodes.delayWet) nodes.delayWet.gain.value = delayMix;
  if (nodes.delay) nodes.delay.delayTime.value = 0.28;
  if (nodes.feedback) nodes.feedback.gain.value = 0.18 + delayMix * 0.28;
  if (nodes.revSend) nodes.revSend.gain.value = revMix * 0.6;
  if (nodes.revWet) nodes.revWet.gain.value = revMix * 0.8;
}

function connectStem(ctx, buffer, i, destination, session) {
  const fx = (session.fx && session.fx[i]) || dfx();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = effectiveGain(i, session);

  const low = ctx.createBiquadFilter();
  const high = ctx.createBiquadFilter();
  const dry = ctx.createGain(); dry.gain.value = 1;

  let panner = null;
  if (typeof ctx.createStereoPanner === 'function') {
    panner = ctx.createStereoPanner();
    source.connect(gain); gain.connect(panner); panner.connect(low);
  } else {
    source.connect(gain); gain.connect(low);
  }
  low.connect(high);
  high.connect(dry);
  dry.connect(destination);

  const delay = typeof ctx.createDelay === 'function' ? ctx.createDelay(1.5) : null;
  const delaySend = ctx.createGain(); delaySend.gain.value = 0;
  const delayWet = ctx.createGain(); delayWet.gain.value = 0;
  const feedback = ctx.createGain(); feedback.gain.value = 0;
  if (delay) {
    high.connect(delaySend); delaySend.connect(delay); delay.connect(feedback); feedback.connect(delay); delay.connect(delayWet); delayWet.connect(destination);
  }

  const revSend = ctx.createGain(); revSend.gain.value = 0;
  const revWet = ctx.createGain(); revWet.gain.value = 0;
  const convolver = ctx.createConvolver();
  try { convolver.buffer = impulse(ctx); } catch {}
  high.connect(revSend); revSend.connect(convolver); convolver.connect(revWet); revWet.connect(destination);

  const nodes = { source, gain, panner, low, high, dry, delay, delaySend, delayWet, feedback, revSend, convolver, revWet };
  applyFx(nodes, fx);
  return nodes;
}
function applyAllGains() {
  if (!current) return;
  live.forEach((nodes, i) => { if (nodes?.gain) nodes.gain.gain.value = effectiveGain(i); });
}

function stop(reset = false) {
  if (playing) {
    offset = time();
    sources.forEach(s => { try { s.stop(); } catch {} });
    sources = [];
    live = [];
    playing = false;
  }
  if (reset) offset = 0;
  const btn = $('#play');
  if (btn) { btn.textContent = '▶'; btn.setAttribute('aria-label', 'Play'); }
  const grid = $('#sequencer-grid');
  if (grid) grid.querySelectorAll('.seq-step.playing').forEach(el => el.classList.remove('playing'));
  seqPlayingStep = -1;
  updatePeakMeter();
}

async function play() {
  if (loading) return toast('Loading audio…');
  if (!buffers.length || !current) return toast('Create or load a song first.');
  if (playing) { stop(); return; }
  const ctx = audioContext();
  await ctx.resume();
  if (offset >= (current.duration || 0) - 0.05) offset = 0;
  started = ctx.currentTime;
  sources = [];
  live = [];
  buffers.forEach((buffer, i) => {
    const nodes = connectStem(ctx, buffer, i, masterGain, current);
    const startAt = Math.min(offset, buffer.duration || 0);
    try { nodes.source.start(0, startAt); } catch { nodes.source.start(0); }
    sources.push(nodes.source);
    live.push(nodes);
  });
  playing = true;
  $('#play').textContent = '⏸';
  $('#play').setAttribute('aria-label', 'Pause');
}

function updatePeakMeter() {
  const bar = $('#meter-bar'), label = $('#peak-label');
  if (!bar || !label) return;
  let peak = 0;
  if (playing && analyser && meterData) {
    try {
      if (analyser.getFloatTimeDomainData) analyser.getFloatTimeDomainData(meterData);
      else {
        const bytes = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(bytes);
        for (let i = 0; i < bytes.length; i++) meterData[i] = (bytes[i] - 128) / 128;
      }
      for (let i = 0; i < meterData.length; i++) { const a = Math.abs(meterData[i]); if (a > peak) peak = a; }
    } catch {}
  }
  const pct = Math.min(100, peak * 100);
  bar.style.width = pct + '%';
  bar.classList.toggle('hot', peak > 0.98);
  bar.classList.toggle('warn', peak > 0.85 && peak <= 0.98);
  if (peak <= 0.00001) label.textContent = '-∞ dB';
  else {
    const db = 20 * Math.log10(peak);
    label.textContent = `${db >= 0 ? '+' : ''}${db.toFixed(1)} dB${peak > 0.98 ? ' !' : ''}`;
  }
  label.classList.toggle('clip', peak > 0.98);
}

function updateSequencerPlayhead(t) {
  if (!isEditableSketch(current)) { seqPlayingStep = -1; return; }
  const grid = $('#sequencer-grid');
  if (!grid) return;
  if (!playing) {
    if (seqPlayingStep !== -1) { grid.querySelectorAll('.seq-step.playing').forEach(el => el.classList.remove('playing')); seqPlayingStep = -1; }
    return;
  }
  const spb = current.pattern?.stepsPerBeat || 4;
  const beat = 60 / (Number(current.bpm) || 92);
  const stepDur = beat / spb;
  const total = (current.pattern?.drums?.kick || []).length || 0;
  if (!total || !stepDur) return;
  const dur = current.duration || (total * stepDur);
  const wrapped = ((t % dur) + dur) % dur;
  const step = Math.min(total - 1, Math.floor(wrapped / stepDur));
  if (step === seqPlayingStep) return;
  grid.querySelectorAll('.seq-step.playing').forEach(el => el.classList.remove('playing'));
  grid.querySelectorAll(`[data-seq-step="${step}"]`).forEach(el => el.classList.add('playing'));
  seqPlayingStep = step;
}

function animate() {
  const t = time();
  const curEl = $('#current-time');
  if (curEl) curEl.textContent = fmt(t);
  $$('.playhead').forEach(e => e.style.left = `${Math.min(100, t / (current?.duration || 24) * 100)}%`);
  updatePeakMeter();
  updateSequencerPlayhead(t);
  if (playing && current && t >= (current.duration || 0)) {
    stop(true);
    if (loop) play().catch(() => {});
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

const colors = [['#eaf0df', '#91a967'], ['#f1ebdf', '#b69b70'], ['#e9eaf3', '#a29bc0'], ['#e5eef0', '#83a7ad']];

function trackMeta(p, i) {
  if (p.separated) return 'SEPARATED STEM';
  if (p.neural) return 'NEURAL FULL SONG';
  if (p.imported) return 'AUDIO FILE';
  return 'INSTRUMENT ' + String(i + 1).padStart(2, '0');
}

function drawTracks() {
  if (!current) return;
  ensureFx(current);
  $('#tracks').innerHTML = current.stems.map((s, i) => {
    const fx = current.fx[i] || dfx();
    const vol = current.volumes?.[i] ?? 0.8;
    const muted = !!current.mutes?.[i];
    const soloed = !!current.solos?.[i]; const dimmed = !trackAudible(i);
    return `<div class="track-row ${dimmed ? 'muted' : ''} ${soloed ? 'soloed' : ''}" style="--track-bg:${colors[i % 4][0]};--track-color:${colors[i % 4][1]}">
      <div class="track-info">
        <div class="track-top">
          <span class="track-icon">${['≋', '♩', '✳', '⌁'][i % 4]}</span>
          <div class="track-details"><strong>${esc(s.name)}</strong><small>${trackMeta(current, i)}</small></div>
          <button class="solo" data-solo="${i}" aria-label="Solo ${esc(s.name)}" aria-pressed="${!!current.solos?.[i]}">S</button>
          <button class="mute" data-mute="${i}" aria-label="Mute ${esc(s.name)}" aria-pressed="${muted}">M</button>
          <button class="stem-export" data-stem-export="${i}" title="Export this stem with current FX/mix">↓</button>
        </div>
        <div class="track-controls">
          <label class="mini-control">Vol <input type="range" min="0" max="1" step=".01" value="${vol}" data-volume="${i}" aria-label="${esc(s.name)} volume"></label>
          <label class="mini-control">Pan <input type="range" min="-1" max="1" step=".01" value="${fx.pan}" data-fx="pan" data-i="${i}" aria-label="${esc(s.name)} pan"></label>
          <label class="mini-control">Low <input type="range" min="0" max="1" step=".01" value="${fx.low}" data-fx="low" data-i="${i}" aria-label="${esc(s.name)} low shelf"></label>
          <label class="mini-control">High <input type="range" min="0" max="1" step=".01" value="${fx.high}" data-fx="high" data-i="${i}" aria-label="${esc(s.name)} high shelf"></label>
          <label class="mini-control">Dly <input type="range" min="0" max="1" step=".01" value="${fx.delay}" data-fx="delay" data-i="${i}" aria-label="${esc(s.name)} delay"></label>
          <label class="mini-control">Rev <input type="range" min="0" max="1" step=".01" value="${fx.reverb}" data-fx="reverb" data-i="${i}" aria-label="${esc(s.name)} reverb"></label>
        </div>
      </div>
      <div class="waveform" data-seek="${i}" title="Click to seek"><canvas aria-label="${esc(s.name)} waveform"></canvas><span class="wave-label">${esc(current.title)} / ${esc(s.name.toLowerCase())}</span><span class="playhead"></span></div>
    </div>`;
  }).join('');
}

function drawWaveforms() {
  $$('.waveform canvas').forEach((canvas, i) => {
    const audio = buffers[i];
    if (!audio) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, rect.width, rect.height);
    c.fillStyle = colors[i % 4][1];
    const data = audio.getChannelData(0);
    const bars = Math.max(1, Math.floor(rect.width / 3));
    const step = Math.max(1, Math.floor(data.length / bars));
    for (let x = 0; x < bars; x++) {
      let max = 0;
      for (let j = x * step; j < Math.min((x + 1) * step, data.length); j += 8) max = Math.max(max, Math.abs(data[j]));
      const h = Math.max(1, Math.min(rect.height - 9, max * rect.height * 2.8));
      c.fillRect(x * 3, (rect.height - h) / 2 + 3, 1.5, h);
    }
  });
}
new ResizeObserver(() => drawWaveforms()).observe($('#tracks'));

async function loadProject(p, opts = {}) {
  const version = ++loadVersion;
  const wasPlaying = playing;
  stop(true);
  current = ensureFx(p);
  buffers = [];
  loading = true;
  patternDirty = false;
  renderedPattern = isEditableSketch(current) ? clonePattern(current.pattern) : null;
  seqPlayingStep = -1;
  $('#play').disabled = true;
  $('#export').disabled = true;
  $('#session-title').textContent = p.title;
  $('#session-meta').textContent = p.imported ? 'Imported audio' : [p.bpm ? p.bpm + ' BPM' : '', p.key || '', fmt(p.duration)].filter(Boolean).join(' · ');
  $('#total-time').textContent = fmt(p.duration || 0);
  $('#save-state').textContent = p.imported ? 'Imported · this session only' : 'Saved on this machine';
  $('#rename').disabled = !!p.imported;
  $('#ruler-labels').innerHTML = Array.from({ length: 5 }, (_, i) => `<span>${fmt((p.duration || 0) * i / 4)}</span>`).join('');
  drawTracks();
  updateSequencerUI();
  updateSeparationUI();
  syncSeqControls();
  try {
    const ctx = audioContext();
    const loaded = p.buffers || await Promise.all(p.stems.map(async s => {
      const base = opts.cacheBust ? (s.url + (s.url.includes('?') ? '&' : '?') + 't=' + Date.now()) : s.url;
      const bust = withToken(base);
      const tok = HARP.token();
      const headers = tok ? { Authorization: 'Bearer ' + tok } : undefined;
      const response = await fetch(bust, headers ? { headers } : undefined);
      if (!response.ok) throw Error(response.status === 401 ? 'Unauthorized (audio access token required)' : 'Audio file missing');
      return ctx.decodeAudioData(await response.arrayBuffer());
    }));
    if (version !== loadVersion) return;
    buffers = loaded;
    p.duration = buffers.length ? Math.max(...buffers.map(b => b.duration)) : (p.duration || 0);
    $('#total-time').textContent = fmt(p.duration);
    $('#ruler-labels').innerHTML = Array.from({ length: 5 }, (_, i) => `<span>${fmt(p.duration * i / 4)}</span>`).join('');
    if (p.separated) $('.timeline-note').textContent = 'SEPARATED STEMS / MIX & EXPORT';
    else $('.timeline-note').textContent = p.neural ? 'FULL SONG / MIX · FX · EXPORT' : p.imported ? 'IMPORTED AUDIO / MIX & EXPORT' : '4 STEMS · EDIT DRUMS · MIX & FX';
    const sr = buffers[0]?.sampleRate ? (buffers[0].sampleRate / 1000) : (p.sampleRate ? p.sampleRate / 1000 : 22.05);
    const base = p.separated ? `${p.engine || 'Separated stems'} · ${sr} kHz` : p.neural ? `${p.engine || 'Neural song'} · ${sr} kHz` : p.imported ? `Imported audio · ${sr} kHz` : `Procedural sketch · 22.05 kHz / 16-bit WAV`;
    const foot = $('#footer-engine') || document.querySelector('.timeline-footer>span:last-child');
    if (foot) foot.textContent = base;
    if (isEditableSketch(current)) { syncSeqControls(); drawSeqLanes(); drawSequencer(); updateSeqState(); }
    drawWaveforms();
  } catch (e) {
    toast('Could not load session: ' + e.message);
  } finally {
    if (version === loadVersion) {
      loading = false;
      $('#play').disabled = !buffers.length;
      $('#export').disabled = !buffers.length;
      updateSeparationUI();
    }
  }
}

let saveTimers = new Map();
function saveMix() {
  if (!current || current.imported) return;
  const id = current.id;
  ensureFx(current);
  const payload = { volumes: [...current.volumes], mutes: [...current.mutes], solos: [...(current.solos || current.mutes.map(()=>false))], fx: current.fx.map(f => ({ ...f })) };
  $('#save-state').textContent = 'Saving mix…';
  clearTimeout(saveTimers.get(id));
  saveTimers.set(id, setTimeout(async () => {
    try {
      await api('/api/projects/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (current.id === id) $('#save-state').textContent = 'Saved on this machine';
    } catch (e) {
      toast(e.message);
      if (current && current.id === id) $('#save-state').textContent = 'Save failed';
    }
  }, 350));
}

$('#tracks').addEventListener('click', async e => {
  if (!current) return;
  const solo = e.target.closest('[data-solo]');
  if (solo) {
    const i = +solo.dataset.solo;
    current.solos[i] = !current.solos[i];
    applyAllGains();
    drawTracks(); drawWaveforms(); saveMix();
    return;
  }
  const mute = e.target.closest('[data-mute]');
  if (mute) {
    const i = +mute.dataset.mute;
    current.mutes[i] = !current.mutes[i];
    applyAllGains();
    drawTracks(); drawWaveforms(); saveMix();
    return;
  }
  const stemExport = e.target.closest('[data-stem-export]');
  if (stemExport) {
    const i = +stemExport.dataset.stemExport;
    exportStem(i).catch(err => toast(err.message));
    return;
  }
  const wave = e.target.closest('[data-seek]');
  if (wave) {
    const wasPlaying = playing;
    stop();
    const rect = wave.getBoundingClientRect();
    offset = Math.min((current.duration || 0) - 0.02, Math.max(0, (e.clientX - rect.left) / rect.width * (current.duration || 0)));
    if (wasPlaying) await play();
  }
});

$('#tracks').addEventListener('input', e => {
  if (!current) return;
  if (e.target.dataset.volume !== undefined) {
    const i = +e.target.dataset.volume;
    current.volumes[i] = +e.target.value;
    if (live[i]?.gain) live[i].gain.gain.value = effectiveGain(i);
    saveMix();
    return;
  }
  if (e.target.dataset.fx) {
    const i = +e.target.dataset.i;
    const key = e.target.dataset.fx;
    if (!current.fx[i]) current.fx[i] = dfx();
    current.fx[i][key] = +e.target.value;
    if (live[i]) applyFx(live[i], current.fx[i]);
    saveMix();
  }
});

// --- Drum step sequencer (editable pattern data, polished UX) ---
let seqSaveTimer;

function seqEffectiveSettings() {
  if (!current) return { bpm: 92, duration: 24 };
  const b = $('#seq-bpm');
  const d = $('#seq-duration');
  const bpm = Math.max(50, Math.min(180, Math.round(Number(b?.value || current.bpm || 92))));
  const duration = Math.max(4, Math.min(120, Math.round(Number(d?.value || current.duration || 24))));
  return { bpm, duration };
}
function seqTotalStepsFor(bpm, duration, spb = (current?.pattern?.stepsPerBeat || 4)) {
  const beat = 60 / (Number(bpm) || 92);
  return Math.max(1, Math.ceil((Number(duration) || 24) / beat * spb));
}
function syncSeqControls() {
  if (!isEditableSketch(current)) return;
  const b = $('#seq-bpm'); const d = $('#seq-duration');
  const bpm = String(Math.round(Number(current.bpm) || 92));
  const dur = String(Math.round(Number(current.duration) || 24));
  if (b && document.activeElement !== b) b.value = bpm;
  if (d && document.activeElement !== d) {
    if (![...d.options].some(o => o.value === dur)) {
      const opt = document.createElement('option'); opt.value = dur; opt.textContent = dur + ' s'; d.appendChild(opt);
    }
    d.value = dur;
  }
}
function resizePatternTo(totalSteps) {
  if (!current?.pattern?.drums) return;
  const lanes = ['kick', 'snare', 'hat'];
  for (const lane of lanes) {
    const arr = Array.isArray(current.pattern.drums[lane]) ? current.pattern.drums[lane].slice(0, totalSteps) : [];
    while (arr.length < totalSteps) arr.push(0);
    current.pattern.drums[lane] = arr;
  }
}
function ensurePatternSizeMatchesControls() {
  if (!isEditableSketch(current)) return;
  const { bpm, duration } = seqEffectiveSettings();
  resizePatternTo(seqTotalStepsFor(bpm, duration));
}
function updateSeqState() {
  const st = $('#seq-state');
  const note = $('#seq-note');
  if (!isEditableSketch(current)) return;
  const { bpm, duration } = seqEffectiveSettings();
  const settingsChanged = Number(bpm) !== Number(current.bpm) || Number(duration) !== Number(current.duration);
  patternDirty = !patternsEqual(current.pattern, renderedPattern) || settingsChanged;
  if (st) {
    st.textContent = patternDirty ? 'Edited · not rendered' : 'Rendered';
    st.classList.toggle('dirty', patternDirty);
    st.classList.toggle('rendered', !patternDirty);
  }
  if (note) {
    const spb = current.pattern?.stepsPerBeat || 4;
    const steps = (current.pattern?.drums?.kick || []).length || seqTotalStepsFor(bpm, duration, spb);
    const bars = Math.ceil(steps / spb);
    note.textContent = `${steps} steps · ${bars} bars · ${bpm} BPM · ${duration}s · draft autosaves; audio updates on Save & render.`;
  }
}

function drawSequencerHeader(totalSteps, spb) {
  const header = $('#sequencer-header');
  if (!header) return;
  header.style.setProperty('--steps', String(totalSteps));
  let cells = '';
  for (let i = 0; i < totalSteps; i++) {
    const beat = Math.floor(i / spb) + 1;
    const sub = (i % spb) + 1;
    const label = sub === 1 ? String(beat) : (sub === 3 ? '·' : '');
    cells += `<span class="seq-hcell ${i % spb === 0 ? 'bar' : ''}" title="Bar ${beat}, step ${sub}">${label}</span>`;
  }
  header.innerHTML = `<div class="seq-row seq-head-row"><span class="seq-lane">Bar/Beat</span>${cells}</div>`;
}

function drawSeqLanes() {
  const wrap = $('#seq-lanes');
  if (!wrap || !isEditableSketch(current)) return;
  const lanes = [['kick','Kick'],['snare','Snare'],['hat','Hat']];
  wrap.innerHTML = lanes.map(([key,label]) => `<div class="seq-lane-controls"><span class="seq-lane-name">${label}</span><button class="mini-action" data-lane-clear="${key}" type="button">Clear</button><button class="mini-action" data-lane-fill="${key}" type="button" data-fill="every">Every beat</button><button class="mini-action" data-lane-fill="${key}" type="button" data-fill="off">Offbeats</button></div>`).join('');
}

function drawSequencer() {
  if (!isEditableSketch(current)) return;
  const grid = $('#sequencer-grid');
  if (!grid) return;
  const pat = current.pattern;
  const lanes = [['kick', 'Kick'], ['snare', 'Snare'], ['hat', 'Hat']];
  const spb = pat.stepsPerBeat || 4;
  const steps = (pat.drums.kick || []).length || 0;
  drawSequencerHeader(steps, spb);
  grid.style.setProperty('--steps', String(steps));
  grid.innerHTML = lanes.map(([key, label]) => {
    const row = (pat.drums[key] || []).map((on, i) => `<button type="button" class="seq-step ${on ? 'on' : ''} ${i % spb === 0 ? 'bar' : ''}" data-seq-lane="${key}" data-seq-step="${i}" aria-label="${label} bar ${Math.floor(i/spb)+1} step ${(i%spb)+1}" aria-pressed="${!!on}"></button>`).join('');
    return `<div class="seq-row"><span class="seq-lane">${label}</span>${row}</div>`;
  }).join('');
  if (seqPlayingStep >= 0 && playing) {
    grid.querySelectorAll(`[data-seq-step="${seqPlayingStep}"]`).forEach(el => el.classList.add('playing'));
  }
}

function updateSequencerUI() {
  const panel = $('#sequencer-panel');
  if (!panel) return;
  const show = isEditableSketch(current);
  panel.hidden = !show;
  if (!show) { seqPlayingStep = -1; return; }
  ensurePatternSizeMatchesControls();
  drawSeqLanes();
  drawSequencer();
  syncSeqControls();
  updateSeqState();
}

async function persistPatternDraft() {
  if (!current || current.imported) return;
  const id = current.id;
  const pattern = clonePattern(current.pattern);
  $('#save-state').textContent = 'Saving draft…';
  clearTimeout(seqSaveTimer);
  seqSaveTimer = setTimeout(async () => {
    try {
      await api('/api/projects/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pattern }) });
      if (current && current.id === id) $('#save-state').textContent = patternDirty ? 'Draft saved (not rendered)' : 'Saved on this machine';
    } catch (e) {
      toast(e.message);
      if (current && current.id === id) $('#save-state').textContent = 'Save failed';
    }
  }, 300);
}

async function renderPattern() {
  if (!isEditableSketch(current)) return toast('Load an editable sketch first.');
  const btn = $('#seq-render');
  const wasPlaying = playing;
  const resumeAt = time();
  if (btn) { btn.disabled = true; btn.textContent = 'Rendering…'; }
  $('#save-state').textContent = 'Rendering sketch…';
  try {
    const { bpm, duration } = seqEffectiveSettings();
    ensurePatternSizeMatchesControls();
    const pattern = clonePattern(current.pattern);
    const updated = await api(`/api/projects/${current.id}/render`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pattern, bpm, duration }) });
    const idx = projects.findIndex(x => x.id === updated.id);
    if (idx >= 0) projects[idx] = { ...projects[idx], ...updated };
    else projects.unshift(updated);
    const merged = projects[idx >= 0 ? idx : 0] || updated;
    renderedPattern = clonePattern(merged.pattern || pattern);
    patternDirty = false;
    renderProjects();
    await loadProject(merged, { cacheBust: true });
    // non-jarring resume: restore position (clamped) and keep playing if it was
    if (wasPlaying && buffers.length && current) {
      offset = Math.min(Math.max(0, resumeAt), Math.max(0, (current.duration || 0) - 0.05));
      await play();
    }
    if (!wasPlaying) updateSeqState();
    toast('Pattern rendered. Mix, FX, and solo/mute preserved.');
  } catch (e) {
    toast(e.message);
    $('#save-state').textContent = 'Render failed';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save & render ↗'; }
    updateSeqState();
  }
}

function resetPatternEdits() {
  if (!isEditableSketch(current) || !renderedPattern) return toast('No rendered pattern to restore.');
  current.pattern = clonePattern(renderedPattern);
  syncSeqControls();
  ensurePatternSizeMatchesControls();
  drawSequencer();
  updateSeqState();
  persistPatternDraft();
  toast('Restored to last rendered pattern (draft). Save & render to apply.');
}

document.addEventListener('click', e => {
  const step = e.target.closest('[data-seq-step]');
  if (step && isEditableSketch(current)) {
    const lane = step.dataset.seqLane; const i = +step.dataset.seqStep;
    if (current.pattern?.drums?.[lane] && i >= 0) {
      current.pattern.drums[lane][i] = current.pattern.drums[lane][i] ? 0 : 1;
      drawSequencer(); updateSeqState(); persistPatternDraft();
    }
    return;
  }
  const clear = e.target.closest('[data-lane-clear]');
  if (clear && isEditableSketch(current)) {
    const lane = clear.dataset.laneClear;
    if (Array.isArray(current.pattern.drums[lane])) current.pattern.drums[lane] = current.pattern.drums[lane].map(() => 0);
    drawSequencer(); updateSeqState(); persistPatternDraft();
    return;
  }
  const fill = e.target.closest('[data-lane-fill]');
  if (fill && isEditableSketch(current)) {
    const lane = fill.dataset.laneFill; const mode = fill.dataset.fill;
    const spb = current.pattern.stepsPerBeat || 4;
    const arr = current.pattern.drums[lane] || [];
    current.pattern.drums[lane] = arr.map((v, i) => mode === 'every' ? (i % spb === 0 ? 1 : 0) : mode === 'off' ? (i % spb === 2 ? 1 : 0) : v);
    drawSequencer(); updateSeqState(); persistPatternDraft();
    return;
  }
});

function onSeqSettingsChange() {
  if (!isEditableSketch(current)) return;
  ensurePatternSizeMatchesControls();
  drawSequencer();
  updateSeqState();
  persistPatternDraft();
}

if ($('#seq-render')) $('#seq-render').onclick = () => renderPattern();
if ($('#seq-reset')) $('#seq-reset').onclick = () => resetPatternEdits();
const seqBpm = $('#seq-bpm'); if (seqBpm) seqBpm.addEventListener('change', onSeqSettingsChange);
const seqDur = $('#seq-duration'); if (seqDur) seqDur.addEventListener('change', onSeqSettingsChange);


// --- Neural stem separation ---
async function refreshSeparator(forceToast = false) {
  const statusEl = $('#separation-status');
  const metaEl = $('#sep-meta');
  const modelInput = $('#sep-model');
  try {
    separatorInfo = await api('/api/separator');
    if (statusEl) statusEl.textContent = separatorInfo.note || (separatorInfo.available ? 'Separator available.' : 'Separator unavailable.');
    if (metaEl) {
      const parts = [];
      if (separatorInfo.exe) parts.push('Exe: ' + separatorInfo.exe);
      if (separatorInfo.modelDir) parts.push('Model dir: ' + separatorInfo.modelDir + (separatorInfo.modelDirExists ? '' : ' (will be fashioned)'));
      if (separatorInfo.defaultModel) parts.push('Default: ' + separatorInfo.defaultModel);
      metaEl.textContent = parts.join(' ? ');
    }
    if (modelInput && !modelInput.value && separatorInfo.defaultModel) modelInput.value = separatorInfo.defaultModel;
    if (forceToast) toast(separatorInfo.available ? 'Separator ready (local).' : 'Separator not available.');
  } catch (e) {
    separatorInfo = { available: false, note: e.message };
    if (statusEl) statusEl.textContent = 'Could not check separator: ' + e.message;
  }
  updateSeparationUI();
}

function separationBlockReason() {
  if (!current) return 'Load a stored session to separate it into stems.';
  if (loading || !buffers.length) return 'Audio is still loading…';
  if (current.imported) return 'Imported browser-only audio cannot be separated here. Use a stored session.';
  if (!current.url && !current.stems?.[0]?.url) return 'This session has no stored audio source to separate.';
  if (separatorInfo && separatorInfo.busy) return 'Another job is already running in the background. Wait for it to finish.';
  if (separatorInfo && separatorInfo.available === false) return separatorInfo.note || 'No local separator found. Set config.separatorExe or install audio-separator.';
  return null;
}

function updateSeparationUI() {
  const btn = $('#separate-btn');
  const note = $('#separation-note');
  if (!btn) return;
  const reason = separationBlockReason();
  btn.disabled = !!reason || !!(separatorInfo && separatorInfo.busy);
  if (note && !note.dataset.busy) {
    if (reason) note.textContent = reason;
    else if (current?.separated) note.textContent = 'This session already has separated stems. You can separate the source again with a different model.';
    else note.textContent = 'Separates the current stored render into stems locally (best-effort). Results depend on the model; first run may download model files.';
  }
}

async function watchJob(id, kind = 'neural') {
  sessionStorage.setItem('harpsachord-job', id);
  sessionStorage.setItem('harpsachord-job-kind', kind);
  const neuralBtn = $('#neural-generate');
  const sepBtn = $('#separate-btn');
  const neuralState = $('#neural-state');
  const sepNote = $('#separation-note');
  const sepStatus = $('#separation-status');
  if (kind === 'neural' && neuralBtn) neuralBtn.disabled = true;
  if (kind === 'separation' && sepBtn) sepBtn.disabled = true;
  if (kind === 'separation' && sepNote) { sepNote.dataset.busy = '1'; sepNote.classList.add('working'); sepNote.textContent = 'Separating stems locally… this can take several minutes and may download a model on the first run.'; }
  try {
    for (;;) {
      const job = await api('/api/jobs/' + id);
      if (job.status === 'failed') throw Error(job.error || 'Job failed');
      if (job.status === 'completed') {
        const p = job.project;
        if (p && !projects.some(x => x.id === p.id)) projects.unshift(ensureFx(p));
        renderProjects(); showView('studio'); if (p) await loadProject(p);
        if (kind === 'neural' && neuralState) { neuralState.classList.remove('working'); neuralState.textContent = 'Completed and saved to your library.'; }
        if (kind === 'separation' && sepNote) { sepNote.classList.remove('working'); sepNote.textContent = 'Separation complete. Opened as a new session with per-stem mix and FX.'; }
        if (kind === 'separation' && sepStatus) sepStatus.textContent = separatorInfo?.note || 'Separation finished.';
        toast(kind === 'separation' ? 'Stems ready. Mix, solo/mute, FX, and export per stem.' : 'Song ready. Press play to listen.');
        sessionStorage.removeItem('harpsachord-job');
        sessionStorage.removeItem('harpsachord-job-kind');
        break;
      }
      const runningMsg = kind === 'separation'
        ? `Separating stems locally… model: ${job.model || 'default'}. First run may download files; long tracks can take several minutes.`
        : 'Rendering in Maestro… this can take several minutes for longer songs. Safe to refresh — it keeps running.';
      if (kind === 'neural' && neuralState) { neuralState.classList.add('working'); neuralState.textContent = runningMsg; }
      if (kind === 'separation' && sepNote) { sepNote.classList.add('working'); sepNote.textContent = runningMsg; }
      await new Promise(r => setTimeout(r, 3000));
    }
  } catch (e) {
    const msg = e.message || 'Job failed';
    if (kind === 'neural' && neuralState) { neuralState.classList.remove('working'); neuralState.textContent = msg; }
    if (kind === 'separation' && sepNote) sepNote.textContent = 'Separation failed: ' + msg;
    toast(msg);
    sessionStorage.removeItem('harpsachord-job');
    sessionStorage.removeItem('harpsachord-job-kind');
  } finally {
    if (kind === 'neural' && neuralBtn) neuralBtn.disabled = false;
    if (kind === 'separation' && sepBtn) { sepBtn.disabled = false; }
    if (kind === 'separation' && sepNote) { sepNote.classList.remove('working'); delete sepNote.dataset.busy; }
    updateSeparationUI();
    updateNeuralButton();
    refreshSeparator().catch(()=>{});
  }
}

if ($('#separate-btn')) $('#separate-btn').onclick = async () => {
  if (!current || loading) return toast('Load a session first.');
  const reason = separationBlockReason();
  if (reason) return toast(reason);
  const btn = $('#separate-btn');
  const model = ($('#sep-model')?.value || separatorInfo?.defaultModel || '').trim();
  const stemPref = ($('#sep-stems')?.value || '').trim();
  if (btn) btn.disabled = true;
  try {
    const payload = { projectId: current.id };
    if (model) payload.model = model;
    if (stemPref) payload.stems = stemPref; // best-effort hint; server/tool may ignore
    const job = await api('/api/separate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    await watchJob(job.id, 'separation');
  } catch (e) {
    toast(e.message);
    const note = $('#separation-note'); if (note) note.textContent = e.message;
    if (btn) btn.disabled = false;
    updateSeparationUI();
  }
};
if ($('#separator-refresh')) $('#separator-refresh').onclick = () => refreshSeparator(true);

$('#master').addEventListener('input', e => {
  if (masterGain) masterGain.gain.value = +e.target.value;
});
$('#play').onclick = () => play().catch(e => toast(e.message));
$('#stop').onclick = () => stop(true);
$('#loop').onclick = () => { loop = !loop; $('#loop').setAttribute('aria-pressed', loop); toast(loop ? 'Loop on' : 'Loop off'); };

function encodeWav(buffer) {
  const channels = buffer.numberOfChannels, n = buffer.length, bytes = new ArrayBuffer(44 + n * channels * 2), v = new DataView(bytes);
  const str = (p, s) => { for (let i = 0; i < s.length; i++) v.setUint8(p + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, bytes.byteLength - 8, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, channels, true); v.setUint32(24, buffer.sampleRate, true); v.setUint32(28, buffer.sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * channels * 2, true);
  const data = Array.from({ length: channels }, (_, i) => buffer.getChannelData(i));
  for (let i = 0; i < n; i++) for (let c = 0; c < channels; c++) v.setInt16(44 + (i * channels + c) * 2, Math.round(Math.max(-1, Math.min(1, data[c][i])) * 32767), true);
  return new Blob([bytes], { type: 'audio/wav' });
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function safeName(s) { return String(s || 'session').replace(/[^a-z0-9 -]/gi, '').trim() || 'session'; }

async function renderOffline(selection = null) {
  if (!buffers.length || !current) throw Error('Load a session first.');
  const rate = (current.imported || current.neural) && buffers[0]?.sampleRate ? buffers[0].sampleRate : 22050;
  const channels = 2;
  const len = Math.ceil((current.duration || Math.max(...buffers.map(b => b.duration))) * rate);
  const offline = new OfflineAudioContext(channels, len, rate);
  const master = offline.createGain();
  master.gain.value = Number($('#master').value || 0.8);
  master.connect(offline.destination);
  const idxs = selection == null ? buffers.map((_, i) => i) : [selection];
  idxs.forEach(i => {
    const b = buffers[i];
    if (!b) return;
    connectStem(offline, b, i, master, current).source.start(0);
  });
  return offline.startRendering();
}

$('#export').onclick = async () => {
  if (!buffers.length || loading) return toast('Load a session first.');
  const button = $('#export');
  button.disabled = true;
  try {
    const rendered = await renderOffline(null);
    downloadBlob(encodeWav(rendered), safeName(current.title) + ' - Mix.wav');
    toast('WAV exported with your current mix and FX (solo/mute/levels applied).');
  } catch (e) {
    toast('Export failed: ' + e.message);
  } finally {
    button.disabled = false;
  }
};

async function exportStem(i) {
  if (!buffers[i] || loading || !current) return toast('Load a session first.');
  const rendered = await renderOffline(i);
  const stemName = current.stems?.[i]?.name || `stem-${i + 1}`;
  downloadBlob(encodeWav(rendered), `${safeName(current.title)} - ${safeName(stemName)}.wav`);
  toast(`Exported ${stemName} with current mix, FX, and solo settings.`);
}

// --- Views / library / create / import / neural (preserved behavior) ---
function showView(next) {
  view = next;
  $('#studio-view').hidden = next !== 'studio';
  $('#library-view').hidden = !['library', 'favorites'].includes(next);
  $('#engines-view').hidden = next !== 'engines';
  $('#page-name').textContent = { studio: 'Create', library: 'Library', favorites: 'Favorites', engines: 'Engines' }[next] || 'Create';
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === next));
  if (next === 'library' || next === 'favorites') {
    $('#library-title').innerHTML = (next === 'favorites' ? 'Favorites' : 'Library') + '<span>.</span>';
    renderLibrary();
  }
  if (next === 'engines') checkSystem();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$$('[data-view]').forEach(b => b.onclick = () => showView(b.dataset.view));

const covers = ['#899a70', '#b39474', '#7d9194', '#9691aa'];
function card(p, i) {
  const kind = p.neural ? 'Neural' : 'Sketch';
  const meta = p.neural ? `${p.bpm || ''} BPM · ${p.key || ''} · ${esc(p.engine || 'Neural song')}` : `${p.bpm} BPM · ${esc(p.key)} · Sketch`;
  return `<article class="project-card"><button class="project-art" style="--cover:${covers[i % 4]};width:100%;border:0" data-open="${p.id}" aria-label="Open ${esc(p.title)}"><span class="cover-type">KITHARAION / ${esc((p.style || kind).toUpperCase())}</span><span class="cover-number">${String(projects.length - i).padStart(2, '0')}</span><span class="card-play">▶</span></button><div class="project-info"><div><button class="project-name" data-open="${p.id}">${esc(p.title)}</button><button class="favorite" data-favorite="${p.id}" aria-label="${p.favorite ? 'Unfavorite' : 'Favorite'} ${esc(p.title)}" aria-pressed="${p.favorite}">${p.favorite ? '♥' : '♡'}</button></div><p>${meta}<span>${fmt(p.duration)}</span></p></div></article>`;
}
function renderLibrary() {
  const q = ($('#search')?.value || '').toLowerCase();
  const filtered = projects.filter(p => (view !== 'favorites' || p.favorite) && (p.title + ' ' + (p.prompt || '') + ' ' + (p.style || '')).toLowerCase().includes(q));
  $('#all-projects').innerHTML = filtered.length ? filtered.map(p => card(p, projects.indexOf(p))).join('') : '<div class="empty">No songs here yet. Create one in Song Forge, make a quick sketch, or favorite a song from your library.</div>';
}
function renderProjects() {
  $('#library-count').textContent = projects.length;
  $('#recent-count').textContent = String(projects.length).padStart(2, '0');
  $('#recent-projects').innerHTML = projects.slice(0, 3).map(card).join('');
  renderLibrary();
}

document.addEventListener('click', async e => {
  const open = e.target.closest('[data-open]');
  if (open) {
    const p = projects.find(x => x.id === open.dataset.open);
    if (p) { showView('studio'); await loadProject(p); $('#session-title').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }
  const favorite = e.target.closest('[data-favorite]');
  if (favorite) {
    const p = projects.find(x => x.id === favorite.dataset.favorite);
    if (!p) return;
    try {
      const updated = await api('/api/projects/' + p.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ favorite: !p.favorite }) });
      p.favorite = updated.favorite; renderProjects();
    } catch (err) { toast(err.message); }
  }
});
if ($('#search')) $('#search').oninput = renderLibrary;

$$('[data-style]').forEach(b => b.onclick = () => { style = b.dataset.style; $$('[data-style]').forEach(x => x.classList.toggle('selected', x === b)); });

const ideas = [
  ['Neon Skyline', 'High-energy synthwave pop with driving bass, bright arpeggios, punchy drums, and an anthemic chorus. Night drive through a neon city.', 'Electronic', 118, 'A minor'],
  ['Golden Anthem', 'Epic cinematic anthem with huge drums, soaring strings and brass, powerful build and an emotional chorus.', 'Cinematic', 96, 'C major'],
  ['Midnight Drift', 'Warm lo-fi hip hop with mellow piano, dusty drums, soft bass, and a hazy late-night atmosphere.', 'Lo-fi', 86, 'A minor'],
  ['Electric Heart', 'Modern pop-rock song with crunchy guitars, tight drums, catchy hooks, and an explosive chorus.', 'Rock', 128, 'G major']
];
let suggestedTitle = 'Neon Skyline';
function idea(index) {
  const p = ideas[index % ideas.length]; suggestedTitle = p[0];
  const np = $('#neural-prompt'); if (np) np.value = p[1];
  const sp = $('#sketch-prompt'); if (sp) sp.value = p[1];
  style = p[2];
  $$('[data-style]').forEach(b => b.classList.toggle('selected', b.dataset.style === style));
  const bpm = $('#bpm'); if (bpm) bpm.value = p[3];
  const sb = $('#sketch-bpm'); if (sb) sb.value = p[3];
  const key = $('#key'); if (key && [...key.options].some(o => o.value === p[4])) key.value = p[4];
  const sk = $('#sketch-key'); if (sk && [...sk.options].some(o => o.value === p[4])) sk.value = p[4];
  showView('studio');
}
const surprise = $('#surprise'); if (surprise) surprise.onclick = () => idea(Math.floor(Math.random() * ideas.length));
const insp = $('#load-inspiration'); if (insp) insp.onclick = () => idea(1);

function newSession() {
  showView('studio');
  suggestedTitle = 'Untitled song';
  const np = $('#neural-prompt'); if (np) { np.value = ''; np.focus(); }
  const sp = $('#sketch-prompt'); if (sp) sp.value = '';
  const ly = $('#neural-lyrics'); if (ly && !$('#neural-instrumental')?.checked) ly.value = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
if ($('#new-session')) $('#new-session').onclick = newSession;

if ($('#rename')) $('#rename').onclick = async () => {
  if (!current || current.imported) return;
  const title = prompt('Name this song', current.title);
  if (!title?.trim()) return;
  try {
    const p = await api('/api/projects/' + current.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim() }) });
    current.title = p.title; $('#session-title').textContent = p.title; drawTracks(); drawWaveforms(); renderProjects(); toast('Renamed.');
  } catch (err) { toast(err.message); }
};

const audioFile = $('#audio-file');
if (audioFile) audioFile.onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 100 * 1024 * 1024) { e.target.value = ''; return toast('Choose a file smaller than 100 MB.'); }
  try {
    const ctx = audioContext();
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    await loadProject({ id: 'import', title: file.name, duration: buffer.duration, bpm: '', key: '', style: 'Import', stems: [{ name: 'Original' }], buffers: [buffer], volumes: [0.8], mutes: [false], fx: [dfx()], imported: true });
    toast('Audio imported. Ready to play, mix, and export.');
  } catch { toast('This audio format could not be decoded. Try a WAV or MP3.'); }
  e.target.value = '';
};


// Neural / Song Forge UI
let neuralModels = [];
let selectedNeuralModel = '';

function modelSupportsLyrics(m) {
  if (!m) return false;
  const id = String(m.id || '').toLowerCase();
  const name = String(m.name || '').toLowerCase();
  return /lm|yue|minimax|music3|lyrics/.test(id + ' ' + name);
}
function modelScore(m) {
  if (!m) return -1;
  let s = m.downloaded ? 100 : 0;
  if (modelSupportsLyrics(m)) s += 25;
  if (/ace_step_v1_5_turbo_lm_4b/.test(m.id)) s += 30;
  else if (/ace_step_v1_5_turbo_lm/.test(m.id)) s += 10;
  else if (/ace_step_v1_5/.test(m.id)) s += 5;
  return s;
}
function renderForgeModels() {
  const chips = $('#forge-model-chips');
  const list = $('#model-list');
  const count = $('#forge-count');
  const models = [...neuralModels].sort((a,b) => modelScore(b) - modelScore(a));
  const installed = models.filter(m => m.downloaded);
  if (count) count.textContent = installed.length ? `(${installed.length} ready / ${models.length} total)` : (models.length ? `(0 ready / ${models.length} total)` : '');
  if (chips) {
    if (!installed.length) {
      chips.innerHTML = '<div class="empty forge-empty">No song models installed yet. Open Maestro/Pinokio, download a music model (ACE-Step LM models are great for songs with lyrics), then refresh.</div>';
    } else {
      chips.innerHTML = installed.map(m => {
        const active = m.id === selectedNeuralModel;
        const vocal = modelSupportsLyrics(m);
        return `<button type="button" class="forge-chip ${active ? 'active' : ''}" data-model="${esc(m.id)}" aria-pressed="${active}"><span class="forge-chip-name">${esc(m.name)}</span><span class="forge-chip-tags"><span class="chip-tag ${vocal ? 'vocal' : ''}">${vocal ? '✦ vocals/lyrics' : 'instrumental focus'}</span><span class="chip-tag ok">ready</span></span></button>`;
      }).join('');
    }
  }
  if (list) {
    list.innerHTML = models.map(m => {
      const vocal = modelSupportsLyrics(m);
      const badge = m.downloaded ? 'READY' : 'NOT DOWNLOADED';
      return `<div class="model-row ${m.downloaded ? 'ready' : ''}"><div class="model-row-main"><span class="model-row-name">${esc(m.name)}</span><small class="model-desc">${esc(m.description || '')}</small><small class="model-tags">${vocal ? 'Can sing lyrics/vocals · ' : 'Instrumental focus · '}${m.downloaded ? 'Installed locally' : 'Download in Maestro/Pinokio to use'}</small></div><div class="model-row-side"><small class="model-badge ${m.downloaded ? 'ok' : ''}">${badge}</small>${m.downloaded ? `<button type="button" class="mini-action use-model" data-use-model="${esc(m.id)}">Use</button>` : ''}</div></div>`;
    }).join('') || '<div class="empty">No models discovered. Start Maestro in Pinokio, then check connection.</div>';
  }
  const hid = $('#neural-model'); if (hid) hid.value = selectedNeuralModel || '';
  updateNeuralButton();
}
function updateNeuralButton() {
  const btn = $('#neural-generate');
  const st = $('#neural-state');
  if (st?.classList.contains('working')) { if (btn) btn.disabled = true; return; }
  const m = neuralModels.find(x => x.id === selectedNeuralModel);
  if (!neuralModels.length) { if (btn) btn.disabled = true; if (st) { st.classList.remove('working'); st.textContent = 'Check connection to discover installed engines.'; } return; }
  if (!m) { if (btn) btn.disabled = true; if (st) { st.classList.remove('working'); st.textContent = neuralModels.some(x=>x.downloaded) ? 'Pick an installed engine above to create a song.' : 'No engines installed yet. Download one in Maestro/Pinokio, then refresh.'; } return; }
  if (!m.downloaded) { if (btn) btn.disabled = true; if (st) { st.classList.remove('working'); st.textContent = 'That engine is not installed. Pick a ready one or download it in Maestro.'; } return; }
  if (btn) btn.disabled = false;
  if (st) { st.classList.remove('working'); st.textContent = modelSupportsLyrics(m) ? 'Ready — can generate songs with vocals/lyrics or instrumentals.' : 'Ready — best for instrumental generations (lyrics may be limited).'; }
}
document.addEventListener('click', e => {
  const chip = e.target.closest('[data-model]');
  if (chip) { selectedNeuralModel = chip.dataset.model || ''; renderForgeModels(); return; }
  const use = e.target.closest('[data-use-model]');
  if (use) { selectedNeuralModel = use.dataset.useModel || ''; renderForgeModels(); showView('studio'); setTimeout(()=>$('#song-forge')?.scrollIntoView({behavior:'smooth',block:'start'}),60); }
});

const instToggle = $('#neural-instrumental');
const lyricsEl = $('#neural-lyrics');
const lyricsHint = $('#forge-lyrics-hint');
function syncInstrumentalUI() {
  if (!lyricsEl) return;
  const off = !!instToggle?.checked;
  lyricsEl.disabled = off;
  lyricsEl.classList.toggle('disabled', off);
  if (off) { if (lyricsEl.value.trim()) lyricsEl.dataset.saved = lyricsEl.value; lyricsEl.placeholder = 'Instrumental selected — lyrics disabled.'; }
  else { if (!lyricsEl.value && lyricsEl.dataset.saved) lyricsEl.value = lyricsEl.dataset.saved; lyricsEl.placeholder = '[Verse 1]\nWrite your words here…\n\n[Chorus]\nLet it soar…'; }
  if (lyricsHint) lyricsHint.textContent = off ? 'Instrumental mode: lyrics will not be sent. Turn off to write/sing lyrics.' : 'Use tags like [Verse], [Chorus], [Bridge]. Pick a model marked “vocals/lyrics” for sung words.';
}
if (instToggle) instToggle.onchange = syncInstrumentalUI;
syncInstrumentalUI();

if ($('#forge-refresh')) $('#forge-refresh').onclick = () => checkSystem();

async function checkSystem() {
  const statusEls = [$('#pinokio-status'), $('#forge-connection')].filter(Boolean);
  const btn = $('#check-engine');
  const fbtn = $('#forge-refresh');
  statusEls.forEach(el => { el.textContent = 'Checking Maestro connection…'; el.classList.remove('ok'); });
  if (btn) btn.disabled = true;
  if (fbtn) fbtn.disabled = true;
  try {
    const [info, maestro] = await Promise.all([api('/api/system'), api('/api/maestro?refresh')]);
    if ($('#data-path')) $('#data-path').textContent = 'Storage: ' + info.dataDir;
    neuralModels = maestro.models || [];
    const installed = neuralModels.filter(m => m.downloaded).sort((a,b)=>modelScore(b)-modelScore(a));
    const msg = maestro.connected ? ('Connected to Maestro · ' + installed.length + ' of ' + neuralModels.length + ' music models ready') : (maestro.message || 'Not connected');
    statusEls.forEach(el => { el.textContent = msg; el.classList.toggle('ok', !!maestro.connected && installed.length > 0); el.classList.toggle('bad', !maestro.connected); });
    if (maestro.connected && btn?.nextElementSibling) { btn.nextElementSibling.href = maestro.base; btn.nextElementSibling.textContent = 'Open Maestro ↗'; }
    if ($('#model-summary')) $('#model-summary').textContent = maestro.connected ? (installed.length ? 'Choose a ready engine to create a full song. Models marked “vocals/lyrics” can sing your lyrics.' : 'No music models installed yet. Download one in Maestro/Pinokio, then refresh.') : (maestro.message || 'Start Maestro in Pinokio, then check connection.');
    if (!installed.some(m => m.id === selectedNeuralModel)) selectedNeuralModel = installed[0]?.id || '';
    renderForgeModels();
  } catch (e) {
    const msg = e.message || 'Could not check connection.';
    statusEls.forEach(el => { el.textContent = msg; el.classList.add('bad'); });
    if ($('#model-summary')) $('#model-summary').textContent = msg;
  } finally {
    if (btn) btn.disabled = false;
    if (fbtn) fbtn.disabled = false;
  }
}
if ($('#check-engine')) $('#check-engine').onclick = checkSystem;

async function watchNeuralJob(id) { return watchJob(id, 'neural'); }

const neuralForm = $('#neural-form');
if (neuralForm) neuralForm.onsubmit = async e => {
  e.preventDefault();
  const model = neuralModels.find(m => m.id === selectedNeuralModel);
  if (!model || !model.downloaded) { toast('Pick an installed engine in the Song Forge first.'); updateNeuralButton(); return; }
  const inst = !!instToggle?.checked;
  const lyrics = inst ? '' : (lyricsEl?.value || '');
  const promptText = ($('#neural-prompt')?.value || '').trim();
  if (!promptText) return toast('Describe your song first.');
  const btn = $('#neural-generate');
  const dur = +($('#duration')?.value || 120);
  if (btn) btn.disabled = true;
  const nst = $('#neural-state');
  if (nst) { nst.classList.add('working'); nst.textContent = `Submitting to Maestro… generating ~${dur}s song`; }
  try {
    const job = await api('/api/neural', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      model: model.id,
      title: (promptText.split(/[.!?\n]/)[0] || 'New song').slice(0, 48),
      prompt: promptText,
      lyrics,
      style, bpm: +$('#bpm').value, key: $('#key').value, duration: dur, seed: Math.floor(Math.random() * 1e8)
    }) });
    await watchNeuralJob(job.id);
  } catch (e) {
    const nst2 = $('#neural-state');
    if (nst2) { nst2.classList.remove('working'); nst2.textContent = e.message; }
    toast(e.message);
    if (btn) btn.disabled = false;
  }
};

// Sketch (procedural) form in "More tools"
const sketchForm = $('#sketch-form');
if (sketchForm) sketchForm.onsubmit = async e => {
  e.preventDefault();
  const prompt = ($('#sketch-prompt')?.value || '').trim();
  if (!prompt) return toast('Give the sketch an idea first.');
  const button = $('#sketch-generate');
  if (button) { button.disabled = true; button.textContent = 'Rendering…'; }
  try {
    const p = await api('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      title: (prompt.split(/[.!?\n]/)[0] || 'Sketch').slice(0, 48),
      prompt,
      style: style || 'Lo-fi',
      bpm: +($('#sketch-bpm')?.value || 92),
      key: $('#sketch-key')?.value || 'A minor',
      duration: +($('#sketch-duration')?.value || 24),
      seed: Math.floor(Math.random() * 1e8)
    }) });
    projects.unshift(p); renderProjects(); await loadProject(p);
    toast('Sketch ready. Press play to hear it.');
  } catch (err) { toast(err.message); }
  finally { if (button) { button.disabled = false; button.textContent = '✦ Make sketch'; } }
};

// detach legacy sketch/create handlers if they targeted elements we replaced
const legacyCreate = $('#create-form');
if (legacyCreate && legacyCreate.id === 'create-form') legacyCreate.onsubmit = null;

$('#help').onclick = () => $('#help-dialog').showModal();
$('.dialog-close').onclick = () => $('#help-dialog').close();

document.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(document.activeElement.tagName) || $('#help-dialog').open || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space') { e.preventDefault(); play().catch(err => toast(err.message)); }
  if (e.key.toLowerCase() === 'n') newSession();
});

try {
  projects = (await api('/api/projects')).map(ensureFx);
  renderProjects();
  if (projects[0]) await loadProject(projects[0]);
  const pendingJob = sessionStorage.getItem('harpsachord-job');
  const pendingKind = sessionStorage.getItem('harpsachord-job-kind') || 'neural';
  if (pendingJob) watchJob(pendingJob, pendingKind);
  refreshSeparator().catch(()=>{});
} catch (e) {
  toast('Unable to load local songs: ' + e.message);
  refreshSeparator().catch(()=>{});
}
