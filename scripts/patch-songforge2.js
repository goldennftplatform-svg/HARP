import fs from 'node:fs';

const file = 'public/app.js';
let a = fs.readFileSync(file, 'utf8');
let n = 0;
function rep(old, neu, label) {
  if (!a.includes(old)) { console.error('MISS', label); return; }
  a = a.split(old).join(neu); console.log('OK', label); n++;
}

// default style
rep("let projects = [], current = null, style = 'Lo-fi', view = 'studio';",
    "let projects = [], current = null, style = 'Cinematic', view = 'studio';", 'default-style');

// page names
rep("  $('#page-name').textContent = { studio: 'The Atelier', library: 'Folio Library', favorites: 'Favored Works', engines: 'Engines of Craft' }[next] || 'The Atelier';",
    "  $('#page-name').textContent = { studio: 'Create', library: 'Library', favorites: 'Favorites', engines: 'Engines' }[next] || 'Create';", 'page-name');
rep("    $('#library-title').innerHTML = (next === 'favorites' ? 'Favored Works' : 'Folio Library') + '<span>.</span>';",
    "    $('#library-title').innerHTML = (next === 'favorites' ? 'Favorites' : 'Library') + '<span>.</span>';", 'library-title');

// Replace legacy block from style/mode/ideas/create-form/import handlers up to Song Forge marker
const legacyStart = "$$('[data-style]').forEach(b => b.onclick = () => { style = b.dataset.style; $$('[data-style]').forEach(x => x.classList.toggle('selected', x === b)); });";
const legacyEnd = "// Neural / Song Forge UI";
const i = a.indexOf(legacyStart);
const j = a.indexOf(legacyEnd, i);
if (i === -1 || j === -1) { console.error('LEGACY markers', i, j); process.exit(1); }

const newLegacy = `$$('[data-style]').forEach(b => b.onclick = () => { style = b.dataset.style; $$('[data-style]').forEach(x => x.classList.toggle('selected', x === b)); });

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

`;
a = a.slice(0, i) + newLegacy + '\n' + a.slice(j);
console.log('OK legacy-block'); n++;

// session meta / save / timeline / footer strings
rep("  $('#session-meta').textContent = p.imported ? 'Brought-in audio' : `${p.bpm || ''} BPM · ${p.key || ''}`;",
    "  $('#session-meta').textContent = p.imported ? 'Imported audio' : [p.bpm ? p.bpm + ' BPM' : '', p.key || '', fmt(p.duration)].filter(Boolean).join(' · ');", 'session-meta');
rep("  $('#save-state').textContent = p.imported ? 'Brought in · this sitting only' : 'Kept upon this machine';",
    "  $('#save-state').textContent = p.imported ? 'Imported · this session only' : 'Saved on this machine';", 'save-state-load');
rep("      if (current.id === id) $('#save-state').textContent = 'Kept upon this machine';",
    "      if (current.id === id) $('#save-state').textContent = 'Saved on this machine';", 'saved-mix');
rep("      if (current && current.id === id) $('#save-state').textContent = patternDirty ? 'Draft kept (not rendered)' : 'Kept upon this machine';",
    "      if (current && current.id === id) $('#save-state').textContent = patternDirty ? 'Draft saved (not rendered)' : 'Saved on this machine';", 'draft-saved');
rep("  $('#save-state').textContent = 'Keeping mix…';", "  $('#save-state').textContent = 'Saving mix…';", 'saving-mix');
rep("  $('#save-state').textContent = 'Keeping draft…';", "  $('#save-state').textContent = 'Saving draft…';", 'saving-draft');

rep("    if (p.separated) $('.timeline-note').textContent = 'VOICES PARTED / MIX TO THY WILL';\n    else $('.timeline-note').textContent = p.neural ? 'NEURAL RENDERING / FULL SONG' : p.imported ? 'THINE AUDIO / THY FOLIO' : 'FOUR VOICES. MARK THE DRUMS. ADORN THE MIX.';",
    "    if (p.separated) $('.timeline-note').textContent = 'SEPARATED STEMS / MIX & EXPORT';\n    else $('.timeline-note').textContent = p.neural ? 'FULL SONG / MIX · FX · EXPORT' : p.imported ? 'IMPORTED AUDIO / MIX & EXPORT' : '4 STEMS · EDIT DRUMS · MIX & FX';", 'timeline-note');

rep(`    const base = p.separated ? \`\${p.engine || 'Parted voices'} · \${sr} kHz · per-voice adornment\` : p.neural ? \`\${p.engine} · \${sr} kHz · per-voice adornment\` : p.imported ? \`Brought-in audio · \${sr} kHz · per-voice adornment\` : \`Scribe’s synthesis · 22.05 kHz / 16-bit WAV · editable drums · per-voice adornment\`;
    const foot = document.querySelector('.timeline-footer>span:last-child');
    if (foot) foot.textContent = base;`,
`    const base = p.separated ? \`\${p.engine || 'Separated stems'} · \${sr} kHz\` : p.neural ? \`\${p.engine || 'Neural song'} · \${sr} kHz\` : p.imported ? \`Imported audio · \${sr} kHz\` : \`Procedural sketch · 22.05 kHz / 16-bit WAV\`;
    const foot = $('#footer-engine') || document.querySelector('.timeline-footer>span:last-child');
    if (foot) foot.textContent = base;`, 'footer-engine');

// boot fail
rep("  toast('Unable to load local folios: ' + e.message);", "  toast('Unable to load local songs: ' + e.message);", 'boot-fail');

// clean mojibake in neural UI strings
a = a.replace(/�\?�/g, '…').replace(/A�/g, '·').replace(/�\+-/g, '↗').replace(/�o�/g, '✦').replace(/�\.�/g, '⏸').replace(/�\?o/g, '“').replace(/�\?\?/g, '”');
console.log('OK mojibake-sweep'); n++;

// fix neural form submit status text mojibake specifically if left
if (a.includes("Submitting to Maestro… (generating")) { /* ok */ }

fs.writeFileSync(file, a, 'utf8');
console.log('patched', n);
