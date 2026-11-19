import fs from 'node:fs';

// --- app.js: replace neural injection + sketch wiring with Song Forge logic ---
const file = 'public/app.js';
let a = fs.readFileSync(file, 'utf8');
const start = '// Neural / Maestro UI injection';
const end = "$('#help').onclick = () => $('#help-dialog').showModal();";
const i = a.indexOf(start);
const j = a.indexOf(end, i);
if (i === -1 || j === -1) {
  console.error('markers', i, j);
  process.exit(1);
}

const replacement = `// Neural / Song Forge UI
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
  if (count) count.textContent = installed.length ? \`(\${installed.length} ready / \${models.length} total)\` : (models.length ? \`(0 ready / \${models.length} total)\` : '');
  if (chips) {
    if (!installed.length) {
      chips.innerHTML = '<div class="empty forge-empty">No song models installed yet. Open Maestro/Pinokio, download a music model (ACE-Step LM models are great for songs with lyrics), then refresh.</div>';
    } else {
      chips.innerHTML = installed.map(m => {
        const active = m.id === selectedNeuralModel;
        const vocal = modelSupportsLyrics(m);
        return \`<button type="button" class="forge-chip \${active ? 'active' : ''}" data-model="\${esc(m.id)}" aria-pressed="\${active}"><span class="forge-chip-name">\${esc(m.name)}</span><span class="forge-chip-tags"><span class="chip-tag \${vocal ? 'vocal' : ''}">\${vocal ? '✦ vocals/lyrics' : 'instrumental focus'}</span><span class="chip-tag ok">ready</span></span></button>\`;
      }).join('');
    }
  }
  if (list) {
    list.innerHTML = models.map(m => {
      const vocal = modelSupportsLyrics(m);
      const badge = m.downloaded ? 'READY' : 'NOT DOWNLOADED';
      return \`<div class="model-row \${m.downloaded ? 'ready' : ''}"><div class="model-row-main"><span class="model-row-name">\${esc(m.name)}</span><small class="model-desc">\${esc(m.description || '')}</small><small class="model-tags">\${vocal ? 'Can sing lyrics/vocals · ' : 'Instrumental focus · '}\${m.downloaded ? 'Installed locally' : 'Download in Maestro/Pinokio to use'}</small></div><div class="model-row-side"><small class="model-badge \${m.downloaded ? 'ok' : ''}">\${badge}</small>\${m.downloaded ? \`<button type="button" class="mini-action use-model" data-use-model="\${esc(m.id)}">Use</button>\` : ''}</div></div>\`;
    }).join('') || '<div class="empty">No models discovered. Start Maestro in Pinokio, then check connection.</div>';
  }
  const hid = $('#neural-model'); if (hid) hid.value = selectedNeuralModel || '';
  updateNeuralButton();
}
function updateNeuralButton() {
  const btn = $('#neural-generate');
  const st = $('#neural-state');
  const m = neuralModels.find(x => x.id === selectedNeuralModel);
  if (!neuralModels.length) { if (btn) btn.disabled = true; if (st) st.textContent = 'Check connection to discover installed engines.'; return; }
  if (!m) { if (btn) btn.disabled = true; if (st) st.textContent = neuralModels.some(x=>x.downloaded) ? 'Pick an installed engine above to create a song.' : 'No engines installed yet. Download one in Maestro/Pinokio, then refresh.'; return; }
  if (!m.downloaded) { if (btn) btn.disabled = true; if (st) st.textContent = 'That engine is not installed. Pick a ready one or download it in Maestro.'; return; }
  if (btn) btn.disabled = false;
  if (st) st.textContent = modelSupportsLyrics(m) ? 'Ready — can generate songs with vocals/lyrics or instrumentals.' : 'Ready — best for instrumental generations (lyrics may be limited).';
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
  else { if (!lyricsEl.value && lyricsEl.dataset.saved) lyricsEl.value = lyricsEl.dataset.saved; lyricsEl.placeholder = '[Verse 1]\\nWrite your words here…\\n\\n[Chorus]\\nLet it soar…'; }
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
  if ($('#neural-state')) $('#neural-state').textContent = \`Submitting to Maestro… (generating ~\${dur}s song)\`;
  try {
    const job = await api('/api/neural', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      model: model.id,
      title: (promptText.split(/[.!?\\n]/)[0] || 'New song').slice(0, 48),
      prompt: promptText,
      lyrics,
      style, bpm: +$('#bpm').value, key: $('#key').value, duration: dur, seed: Math.floor(Math.random() * 1e8)
    }) });
    await watchNeuralJob(job.id);
  } catch (e) {
    if ($('#neural-state')) $('#neural-state').textContent = e.message;
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
      title: (prompt.split(/[.!?\\n]/)[0] || 'Sketch').slice(0, 48),
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

`;

a = a.slice(0, i) + replacement + a.slice(j);
fs.writeFileSync(file, a, 'utf8');
console.log('app-patched-songforge');
