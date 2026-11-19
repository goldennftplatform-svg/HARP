import fs from 'node:fs';

const file = 'public/app.js';
let a = fs.readFileSync(file, 'utf8');
let n = 0;

function rep(old, neu, label) {
  if (!a.includes(old)) { console.error('MISS', label); return false; }
  a = a.split(old).join(neu);
  console.log('OK', label);
  n++;
  return true;
}
function repRe(re, neu, label) {
  if (!re.test(a)) { console.error('MISS', label); return false; }
  a = a.replace(re, neu);
  console.log('OK', label);
  n++;
  return true;
}

// Transport / basic toasts (fix mojibake and rebrand)
repRe(/if \(btn\) \{ btn\.textContent = .*?; btn\.setAttribute\('aria-label', 'Play session'\); \}/,
  "if (btn) { btn.textContent = '▶'; btn.setAttribute('aria-label', 'Play folio'); }", 'stop-btn');
repRe(/\$\('#play'\)\.textContent = .*?;\n  \$\('#play'\)\.setAttribute\('aria-label', 'Pause session'\);/,
  "$('#play').textContent = '⏸';\n  $('#play').setAttribute('aria-label', 'Pause folio');", 'play-btn');
repRe(/if \(loading\) return toast\('Loading audio.*?'\);/,
  "if (loading) return toast('Reading the voices…');", 'loading-toast');
rep("if (!buffers.length || !current) return toast('Create or import a session first.');",
  "if (!buffers.length || !current) return toast('Inscribe or bring in a folio first.');", 'no-session-toast');

// Peak meter
repRe(/if \(peak <= 0\.00001\) label\.textContent = '.*? dB';/,
  "if (peak <= 0.00001) label.textContent = '-∞ dB';", 'meter-inf');

// Session meta / save states
repRe(/\$\('#session-meta'\)\.textContent = p\.imported \? 'Imported audio' : `\$\{p\.bpm \|\| ''\} BPM .*? \$\{p\.key \|\| ''\}`;/,
  "$('#session-meta').textContent = p.imported ? 'Brought-in audio' : `${p.bpm || ''} BPM · ${p.key || ''}`;", 'session-meta');
repRe(/\$\('#save-state'\)\.textContent = p\.imported \? 'Imported .*? this tab only' : 'Saved on this machine';/,
  "$('#save-state').textContent = p.imported ? 'Brought in · this sitting only' : 'Kept upon this machine';", 'save-state-load');

repRe(/if \(p\.separated\) \$\('\.timeline-note'\)\.textContent = 'SEPARATED STEMS \/ EDITABLE MIX';\n    else \$\('\.timeline-note'\)\.textContent = p\.neural \? 'NEURAL GENERATION \/ FULL SONG' : p\.imported \? 'YOUR AUDIO \/ YOUR SESSION' : 'FOUR STEMS\. EDIT DRUMS\. MIX WITH FX\.';/,
  "if (p.separated) $('.timeline-note').textContent = 'VOICES PARTED / MIX TO THY WILL';\n    else $('.timeline-note').textContent = p.neural ? 'NEURAL RENDERING / FULL SONG' : p.imported ? 'THINE AUDIO / THY FOLIO' : 'FOUR VOICES. MARK THE DRUMS. ADORN THE MIX.';", 'timeline-note');

repRe(/const base = p\.separated \? `\$\{p\.engine \|\| 'Separated stems'\} .*? \$\{sr\} kHz .*? per-stem FX` : p\.neural \? `\$\{p\.engine\} .*? \$\{sr\} kHz .*? per-stem FX` : p\.imported \? `Imported audio .*? \$\{sr\} kHz .*? per-stem FX` : `Sketch synthesis .*? 22\.05 kHz \/ 16-bit WAV .*? editable drums .*? per-stem FX`;/,
  "const base = p.separated ? `${p.engine || 'Parted voices'} · ${sr} kHz · per-voice adornment` : p.neural ? `${p.engine} · ${sr} kHz · per-voice adornment` : p.imported ? `Brought-in audio · ${sr} kHz · per-voice adornment` : `Scribe’s synthesis · 22.05 kHz / 16-bit WAV · editable drums · per-voice adornment`;", 'footer-base');

rep("    toast('Could not load session: ' + e.message);",
  "    toast('Could not lay open folio: ' + e.message);", 'load-fail');

// Mix save / draft / render states
repRe(/\$\('#save-state'\)\.textContent = 'Saving mix.*?';/,
  "$('#save-state').textContent = 'Keeping mix…';", 'saving-mix');
rep("      if (current.id === id) $('#save-state').textContent = 'Saved on this machine';",
  "      if (current.id === id) $('#save-state').textContent = 'Kept upon this machine';", 'saved-mix');
repRe(/\$\('#save-state'\)\.textContent = 'Saving draft.*?';/,
  "$('#save-state').textContent = 'Keeping draft…';", 'saving-draft');
rep("      if (current && current.id === id) $('#save-state').textContent = patternDirty ? 'Draft saved (not rendered)' : 'Saved on this machine';",
  "      if (current && current.id === id) $('#save-state').textContent = patternDirty ? 'Draft kept (not rendered)' : 'Kept upon this machine';", 'draft-saved');
// save failed appears twice (mix and draft blocks) - replace all
rep("      if (current && current.id === id) $('#save-state').textContent = 'Save failed';",
  "      if (current && current.id === id) $('#save-state').textContent = 'Keeping failed';", 'save-fail-draft');
rep("      toast(e.message);\n      if (current && current.id === id) $('#save-state').textContent = 'Save failed';",
  "      toast(e.message);\n      if (current && current.id === id) $('#save-state').textContent = 'Keeping failed';", 'save-fail-mix');

rep("  if (!isEditableSketch(current)) return toast('Load an editable sketch session first.');",
  "  if (!isEditableSketch(current)) return toast('Lay open an editable sketch folio first.');", 'seq-need-editable');
repRe(/if \(btn\) \{ btn\.disabled = true; btn\.textContent = 'Rendering.*?'; \}\n  \$\('#save-state'\)\.textContent = 'Rendering sketch.*?';/,
  "if (btn) { btn.disabled = true; btn.textContent = 'Rendering…'; }\n  $('#save-state').textContent = 'Rendering the sketch…';", 'rendering-sketch');
rep("    toast('Sketch re-rendered from the edited pattern (mix/FX kept).');",
  "    toast('Sketch renewed from the edited pattern (mix & adornment kept).');", 'rerendered-toast');
rep("    $('#save-state').textContent = 'Render failed';",
  "    $('#save-state').textContent = 'Rendering failed';", 'render-fail-state');
rep("  if (!isEditableSketch(current) || !renderedPattern) return toast('No rendered pattern to reset to.');",
  "  if (!isEditableSketch(current) || !renderedPattern) return toast('No rendered pattern to restore.');", 'no-rendered');
rep("  toast('Edits reset to the last rendered pattern.');",
  "  toast('Marks restored to the last rendered pattern.');", 'reset-toast');

// Separation UI/messages
rep("  if (!current) return 'Load a session to separate it into stems.';",
  "  if (!current) return 'Lay open a folio to part it into voices.';", 'sep-no-current');
rep("  if (separatorInfo && separatorInfo.available === false) return separatorInfo.note || 'No local separator available. Configure config.separatorExe or install audio-separator.';",
  "  if (separatorInfo && separatorInfo.available === false) return separatorInfo.note || 'No local parting apparatus found. Set config.separatorExe or install audio-separator.';", 'sep-unavail-reason');
rep("  if (current.imported) return 'Imported browser-only audio cannot be separated from here. Use a stored session.';",
  "  if (current.imported) return 'Audio brought in for this sitting alone cannot be parted here. Use a kept folio.';", 'sep-imported');
rep("  if (!current.url && !current.stems?.[0]?.url) return 'This session has no stored audio source to separate.';",
  "  if (!current.url && !current.stems?.[0]?.url) return 'This folio holds no kept audio source to part.';", 'sep-no-source');
rep("  if (separatorInfo?.busy) return 'A background job is already running. Wait for it to finish.';",
  "  if (separatorInfo?.busy) return 'A task is already at work in the background. Await its finish.';", 'sep-busy');
rep("    else if (current?.separated) note.textContent = 'This session already contains separated stems. You can separate the selected source again to try a different model.';",
  "    else if (current?.separated) note.textContent = 'This folio already holds parted voices. You may part the source anew to try a different model.';", 'sep-already');
rep("    else note.textContent = 'Splits the current stored render into stems locally (best-effort). Results and stem count depend on the selected model/tool; first run may download model files.';",
  "    else note.textContent = 'Parts the current kept rendering into voices locally (by best endeavor). Results and count depend on model and craft; the first trial may fetch model files.';", 'sep-ready-note');

repRe(/if \(kind === 'separation' && sepNote\) \{ sepNote\.dataset\.busy = '1'; sepNote\.textContent = 'Separating stems locally.*?'; \}/,
  "if (kind === 'separation' && sepNote) { sepNote.dataset.busy = '1'; sepNote.textContent = 'Parting voices locally… this may take several minutes and may fetch a model on the first trial.'; }", 'sep-busy-note');
rep("        if (kind === 'neural' && neuralState) neuralState.textContent = 'Completed and saved to your library.';",
  "        if (kind === 'neural' && neuralState) neuralState.textContent = 'Completed and kept in thy library.';", 'neural-complete-state');
rep("        if (kind === 'separation' && sepNote) sepNote.textContent = 'Separation complete. Opened as a new editable session with per-stem mix/FX.';",
  "        if (kind === 'separation' && sepNote) sepNote.textContent = 'Parting complete. Opened as a new folio with per-voice mix and adornment.';", 'sep-complete-note');
rep("        if (kind === 'separation' && sepStatus) sepStatus.textContent = separatorInfo?.note || 'Separation finished.';",
  "        if (kind === 'separation' && sepStatus) sepStatus.textContent = separatorInfo?.note || 'Parting finished.';", 'sep-finished-status');
rep("        toast(kind === 'separation' ? 'Separated stems ready. Mix, solo/mute, FX, and export per stem.' : 'Neural song ready. Press play to listen.');",
  "        toast(kind === 'separation' ? 'Voices parted and ready. Mix, solo or mute, adorn, and export each voice.' : 'Neural song ready. Press play to hear it.');", 'job-complete-toast');
repRe(/\? `Separating stems locally \(running\).*?`/,
  "? `Parting voices locally (in progress)… model: ${job.model || 'default'}. First trial may fetch files; long works may take several minutes.`", 'sep-running-msg');
rep("        : 'Rendering in Maestro. Your job continues if you refresh this page.';",
  "        : 'Rendering in Maestro. Thy work continues if thou refreshest this page.';", 'neural-running-msg');
rep("    if (kind === 'separation' && sepNote) sepNote.textContent = 'Separation failed: ' + msg;",
  "    if (kind === 'separation' && sepNote) sepNote.textContent = 'Parting failed: ' + msg;", 'sep-failed-msg');
rep("  if (!current || loading) return toast('Load a session first.');",
  "  if (!current || loading) return toast('Lay open a folio first.');", 'separate-click-guard');

// Export
rep("  if (!buffers.length || !current) throw Error('Load a session first.');",
  "  if (!buffers.length || !current) throw Error('Lay open a folio first.');", 'export-throw');
rep("  if (!buffers.length || loading) return toast('Load a session first.');",
  "  if (!buffers.length || loading) return toast('Lay open a folio first.');", 'export-guard');
rep("    toast('WAV exported with your current mix and FX (solo/mute/levels applied).');",
  "    toast('WAV exported with thy current mix and adornment (solo, mute, and levels applied).');", 'export-toast');
rep("  if (!buffers[i] || loading || !current) return toast('Load a session first.');",
  "  if (!buffers[i] || loading || !current) return toast('Lay open a folio first.');", 'stem-export-guard');
rep("  toast(`Exported ${stemName} with current FX/mix/solo settings.`);",
  "  toast(`Exported ${stemName} with current mix, adornment, and solo settings.`);", 'stem-export-toast');

// Views / nav
rep("  $('#page-name').textContent = { studio: 'Create studio', library: 'My library', favorites: 'Favorites', engines: 'Engines' }[next] || 'Studio';",
  "  $('#page-name').textContent = { studio: 'The Atelier', library: 'Folio Library', favorites: 'Favored Works', engines: 'Engines of Craft' }[next] || 'The Atelier';", 'page-name');
rep("    $('#library-title').innerHTML = (next === 'favorites' ? 'Favorites' : 'My library') + '<span>.</span>';",
  "    $('#library-title').innerHTML = (next === 'favorites' ? 'Favored Works' : 'Folio Library') + '<span>.</span>';", 'library-title');

// Cards
rep("  const meta = p.neural ? `${p.bpm || ''} BPM · ${p.key || ''} · ${esc(p.engine || 'Neural')}` : `${p.bpm} BPM · ${esc(p.key)} · Sketch`;",
  "  const meta = p.neural ? `${p.bpm || ''} BPM · ${p.key || ''} · ${esc(p.engine || 'Neural')}` : `${p.bpm} BPM · ${esc(p.key)} · Scribe’s sketch`;", 'card-meta');
rep('<span class="cover-type">HARPSACHORD / ${esc((p.style || kind).toUpperCase())}</span>',
  '<span class="cover-type">KITHARAION / ${esc((p.style || kind).toUpperCase())}</span>', 'cover-type');
rep("  $('#all-projects').innerHTML = filtered.length ? filtered.map(p => card(p, projects.indexOf(p))).join('') : '<div class=\"empty\">No sessions here yet. Make a sketch or favorite one from your library.</div>';",
  "  $('#all-projects').innerHTML = filtered.length ? filtered.map(p => card(p, projects.indexOf(p))).join('') : '<div class=\"empty\">No folios here yet. Inscribe a sketch or mark one as favored in thy library.</div>';", 'empty-library');

// Ideas & creation flow
rep("  ['After hours, somewhere', 'Dusty lo-fi drums, warm Rhodes keys, a mellow bassline. A late-night walk through a city that never quite sleeps.', 'Lo-fi', 92, 'A minor']",
  "  ['By lamplight, after hours', 'Dusty hand-drum, warm keys as of a clavichord, a gentle bass line. A late walk by lamplight through a sleeping polis.', 'Lo-fi', 92, 'A minor']", 'idea-default');
rep("let suggestedTitle = 'After hours, somewhere';",
  "let suggestedTitle = 'By lamplight, after hours';", 'suggested-default');
rep("function newSession() { showView('studio'); $$('[data-mode]')[0]?.click(); $('#prompt').value = ''; suggestedTitle = 'Untitled session'; $('#prompt').focus(); }",
  "function newSession() { showView('studio'); $$('[data-mode]')[0]?.click(); $('#prompt').value = ''; suggestedTitle = 'Untitled folio'; $('#prompt').focus(); }", 'new-session');
rep("  if (!$('#prompt').value.trim()) return toast('Give your sketch a little inspiration first.');",
  "  if (!$('#prompt').value.trim()) return toast('Offer thy sketch a little inspiration first.');", 'need-prompt');
repRe(/button\.disabled = true; button\.textContent = '.*?Rendering four stems.*?';/,
  "button.disabled = true; button.textContent = 'Rendering four voices…';", 'rendering-four');
rep("      title: suggestedTitle === 'Untitled session' ? $('#prompt').value.trim().split(/[.!?]/)[0].slice(0, 48) : suggestedTitle,",
  "      title: suggestedTitle === 'Untitled folio' ? $('#prompt').value.trim().split(/[.!?]/)[0].slice(0, 48) : suggestedTitle,", 'untitled-title');
rep("    toast('Your sketch is ready. Press play to hear it.');",
  "    toast('Thy sketch is ready. Press play to hear it.');", 'sketch-ready');
repRe(/finally \{ button\.disabled = false; button\.innerHTML = '.*?&nbsp; Create a sketch <span>.*?<\/span>'; \}/,
  "finally { button.disabled = false; button.innerHTML = '✦ &nbsp; Inscribe a sketch <span>↗</span>'; }", 'create-btn-reset');
rep("  const title = prompt('Name this session', current.title);",
  "  const title = prompt('Name this folio', current.title);", 'rename-prompt');
rep("    current.title = p.title; $('#session-title').textContent = p.title; drawTracks(); drawWaveforms(); renderProjects(); toast('Session renamed.');",
  "    current.title = p.title; $('#session-title').textContent = p.title; drawTracks(); drawWaveforms(); renderProjects(); toast('Folio renamed.');", 'renamed-toast');
rep("    toast('Audio imported. Ready to play, tweak FX, or export.');",
  "    toast('Audio brought in. Ready to play, adorn, or export.');", 'import-toast');

// Neural injected card
rep('  enginesGrid.insertAdjacentHTML(\'beforeend\', `<article class="panel setup-card wide"><span class="pill">NEURAL MUSIC / MAESTRO</span><h2>The next layer of your sound.</h2><p id="model-summary">Check your connection to discover music models.</p><form id="neural-form"><label class="field-label" for="neural-model">Music model</label><select id="neural-model" class="search"><option value="">Discover models first</option></select><label class="field-label" for="neural-prompt">Describe the music</label><textarea id="neural-prompt" maxlength="2000" required placeholder="Genre, mood, instruments, arrangement…">Warm lo-fi hip hop with mellow piano, dusty drums, soft bass, late-night atmosphere.</textarea><label class="field-label" for="neural-lyrics">Lyrics <span class="optional">optional · leave blank for instrumental</span></label><textarea id="neural-lyrics" maxlength="8000" placeholder="[Verse]\\nYour words go here…"></textarea><p>Uses tempo, key, and duration from Create studio. Returns one full-song track. Use per-stem FX and “Separate stems” in the studio to split full renders locally (best-effort). Model licenses apply.</p><button class="dark-button" id="neural-generate" disabled>Generate with Maestro ↗</button><span id="neural-state" role="status" class="neural-state">Model weights required</span></form><div id="model-list" class="model-list"></div></article>`);',
  '  enginesGrid.insertAdjacentHTML(\'beforeend\', `<article class="panel setup-card wide"><span class="pill">NEURAL MUSIC / MAESTRO</span><h2>A deeper stratum of thy sound.</h2><p id="model-summary">Examine thy connection to discover music models.</p><form id="neural-form"><label class="field-label" for="neural-model">Music model</label><select id="neural-model" class="search"><option value="">Discover models first</option></select><label class="field-label" for="neural-prompt">Describe the music</label><textarea id="neural-prompt" maxlength="2000" required placeholder="Manner, mood, instruments, arrangement…">Warm lo-fi hip hop with mellow piano, dusty drums, soft bass, late-night atmosphere.</textarea><label class="field-label" for="neural-lyrics">Lyrics <span class="optional">optional · leave blank for instrumental</span></label><textarea id="neural-lyrics" maxlength="8000" placeholder="[Verse]\\nYour words go here…"></textarea><p>Uses tempo, key, and duration from The Atelier. Yields one full-song rendering. Use per-voice adornment and “Part the voices” in the atelier to divide full renderings locally (by best endeavor). Model licenses apply.</p><button class="dark-button" id="neural-generate" disabled>Engender with Maestro ↗</button><span id="neural-state" role="status" class="neural-state">Model weights required</span></form><div id="model-list" class="model-list"></div></article>`);', 'neural-card');

repRe(/if \(statusEl\) statusEl\.textContent = 'Checking Maestro through Pinokio.*?';/,
  "if (statusEl) statusEl.textContent = 'Examining Maestro through Pinokio…';", 'check-status');
rep("    if ($('#data-path')) $('#data-path').textContent = 'Current session storage: ' + info.dataDir;",
  "    if ($('#data-path')) $('#data-path').textContent = 'Present store of folios: ' + info.dataDir;", 'data-path');
rep("    if ($('#model-summary')) $('#model-summary').textContent = maestro.connected ? 'Live catalog from your installed Maestro. Download status comes directly from its API.' : 'Start Maestro in Pinokio, then check the connection again.';",
  "    if ($('#model-summary')) $('#model-summary').textContent = maestro.connected ? 'Living catalog from thine installed Maestro. Download state comes from its API.' : 'Set Maestro in motion within Pinokio, then examine the apparatus anew.';", 'model-summary');
repRe(/if \(\$\('#neural-state'\)\) \$\('#neural-state'\)\.textContent = 'Submitting to Maestro.*?';/,
  "if ($('#neural-state')) $('#neural-state').textContent = 'Submitting to Maestro…';", 'submitting-neural');

rep("  toast('Unable to load local sessions: ' + e.message);",
  "  toast('Unable to load local folios: ' + e.message);", 'boot-fail');

fs.writeFileSync(file, a, 'utf8');
console.log('TOTAL', n);
