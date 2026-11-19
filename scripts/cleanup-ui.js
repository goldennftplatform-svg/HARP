import fs from 'node:fs';

const file = 'public/app.js';
let a = fs.readFileSync(file, 'utf8');
let n = 0;
function rep(old, neu, label) {
  if (a.includes(old)) { a = a.split(old).join(neu); console.log('OK', label); n++; }
  else console.error('MISS', label);
}

// playback / loading
rep("  if (btn) { btn.textContent = '▶'; btn.setAttribute('aria-label', 'Play folio'); }",
    "  if (btn) { btn.textContent = '▶'; btn.setAttribute('aria-label', 'Play'); }", 'stop-aria');
rep("  if (loading) return toast('Reading the voices…');",
    "  if (loading) return toast('Loading audio…');", 'loading-toast');
rep("  if (!buffers.length || !current) return toast('Inscribe or bring in a folio first.');",
    "  if (!buffers.length || !current) return toast('Create or load a song first.');", 'no-song-toast');
rep("  $('#play').setAttribute('aria-label', 'Pause folio');",
    "  $('#play').setAttribute('aria-label', 'Pause');", 'pause-aria');

// load/save/render states
rep("    toast('Could not lay open folio: ' + e.message);",
    "    toast('Could not load session: ' + e.message);", 'load-fail');
rep("      if (current && current.id === id) $('#save-state').textContent = 'Keeping failed';",
    "      if (current && current.id === id) $('#save-state').textContent = 'Save failed';", 'save-failed');
rep("  if (!isEditableSketch(current)) return toast('Lay open an editable sketch folio first.');",
    "  if (!isEditableSketch(current)) return toast('Load an editable sketch first.');", 'need-sketch');
rep("    $('#save-state').textContent = 'Rendering the sketch…';",
    "    $('#save-state').textContent = 'Rendering sketch…';", 'rendering-state');
rep("    toast('Pattern rendered anew. Mix, adornment, and solo/mute kept.');",
    "    toast('Pattern rendered. Mix, FX, and solo/mute preserved.');", 'render-toast');
rep("    $('#save-state').textContent = 'Rendering failed';",
    "    $('#save-state').textContent = 'Render failed';", 'render-failed-state');
rep("    if (btn) { btn.disabled = false; btn.textContent = 'Save & render ?'; }",
    "    if (btn) { btn.disabled = false; btn.textContent = 'Save & render ↗'; }", 'render-btn');
rep("  if (!isEditableSketch(current) || !renderedPattern) return toast('No rendered pattern to restore.');",
    "  if (!isEditableSketch(current) || !renderedPattern) return toast('No rendered pattern to restore.');", 'no-rendered');
rep("  toast('Marks restored to the last rendered pattern (draft). Save & render to renew the sound.');",
    "  toast('Restored to last rendered pattern (draft). Save & render to apply.');", 'reset-toast');

// separation
rep("  if (!current) return 'Lay open a folio to part it into voices.';",
    "  if (!current) return 'Load a stored session to separate it into stems.';", 'sep-no-current');
rep("  if (loading || !buffers.length) return 'Audio is still loading…';",
    "  if (loading || !buffers.length) return 'Audio is still loading…';", 'sep-loading-ok');
rep("  if (current.imported) return 'Audio brought in for this sitting alone cannot be parted here. Use a kept folio.';",
    "  if (current.imported) return 'Imported browser-only audio cannot be separated here. Use a stored session.';", 'sep-imported');
rep("  if (!current.url && !current.stems?.[0]?.url) return 'This folio holds no kept audio source to part.';",
    "  if (!current.url && !current.stems?.[0]?.url) return 'This session has no stored audio source to separate.';", 'sep-no-source');
rep("  if (separatorInfo && separatorInfo.busy) return 'A task is already at work in the background. Await its finish.';",
    "  if (separatorInfo && separatorInfo.busy) return 'Another job is already running in the background. Wait for it to finish.';", 'sep-busy');
rep("  if (separatorInfo && separatorInfo.available === false) return separatorInfo.note || 'No local parting apparatus found. Set config.separatorExe or install audio-separator.';",
    "  if (separatorInfo && separatorInfo.available === false) return separatorInfo.note || 'No local separator found. Set config.separatorExe or install audio-separator.';", 'sep-unavail');
rep("    else if (current?.separated) note.textContent = 'This folio already holds parted voices. You may part the source anew to try a different model.';",
    "    else if (current?.separated) note.textContent = 'This session already has separated stems. You can separate the source again with a different model.';", 'sep-already');
rep("    else note.textContent = 'Parts the current kept rendering into voices locally (by best endeavor). Results and count depend on model and craft; the first trial may fetch model files.';",
    "    else note.textContent = 'Separates the current stored render into stems locally (best-effort). Results depend on the model; first run may download model files.';", 'sep-ready');

rep("  if (kind === 'separation' && sepNote) { sepNote.dataset.busy = '1'; sepNote.textContent = 'Parting voices locally… this may take several minutes and may fetch a model on the first trial.'; }",
    "  if (kind === 'separation' && sepNote) { sepNote.dataset.busy = '1'; sepNote.textContent = 'Separating stems locally… this can take several minutes and may download a model on the first run.'; }", 'sep-watch-busy');
rep("        if (kind === 'neural' && neuralState) neuralState.textContent = 'Completed and kept in thy library.';",
    "        if (kind === 'neural' && neuralState) neuralState.textContent = 'Completed and saved to your library.';", 'neural-done');
rep("        if (kind === 'separation' && sepNote) sepNote.textContent = 'Parting complete. Opened as a new folio with per-voice mix and adornment.';",
    "        if (kind === 'separation' && sepNote) sepNote.textContent = 'Separation complete. Opened as a new session with per-stem mix and FX.';", 'sep-done-note');
rep("        if (kind === 'separation' && sepStatus) sepStatus.textContent = separatorInfo?.note || 'Parting finished.';",
    "        if (kind === 'separation' && sepStatus) sepStatus.textContent = separatorInfo?.note || 'Separation finished.';", 'sep-done-status');
rep("        toast(kind === 'separation' ? 'Voices parted and ready. Mix, solo or mute, adorn, and export each voice.' : 'Neural song ready. Press play to hear it.');",
    "        toast(kind === 'separation' ? 'Stems ready. Mix, solo/mute, FX, and export per stem.' : 'Song ready. Press play to listen.');", 'job-done-toast');
rep("        ? `Parting voices locally (in progress)… model: ${job.model || 'default'}. First trial may fetch files; long works may take several minutes.`",
    "        ? `Separating stems locally… model: ${job.model || 'default'}. First run may download files; long tracks can take several minutes.`", 'sep-running');
rep("        : 'Rendering in Maestro. Thy work continues if thou refreshest this page.';",
    "        : 'Rendering in Maestro. This keeps running if you refresh the page.';", 'neural-running');
rep("    if (kind === 'separation' && sepNote) sepNote.textContent = 'Parting failed: ' + msg;",
    "    if (kind === 'separation' && sepNote) sepNote.textContent = 'Separation failed: ' + msg;", 'sep-failed');
rep("  if (!current || loading) return toast('Lay open a folio first.');",
    "  if (!current || loading) return toast('Load a session first.');", 'sep-click');

// export
rep("  if (!buffers.length || !current) throw Error('Lay open a folio first.');",
    "  if (!buffers.length || !current) throw Error('Load a session first.');", 'export-throw');
rep("  if (!buffers.length || loading) return toast('Lay open a folio first.');",
    "  if (!buffers.length || loading) return toast('Load a session first.');", 'export-guard');
rep("    toast('WAV exported with thy current mix and adornment (solo, mute, and levels applied).');",
    "    toast('WAV exported with your current mix and FX (solo/mute/levels applied).');", 'export-toast');
rep("  if (!buffers[i] || loading || !current) return toast('Lay open a folio first.');",
    "  if (!buffers[i] || loading || !current) return toast('Load a session first.');", 'stem-export-guard');
rep("  toast(`Exported ${stemName} with current mix, adornment, and solo settings.`);",
    "  toast(`Exported ${stemName} with current mix, FX, and solo settings.`);", 'stem-export-toast');

// library/cards text
rep("  const meta = p.neural ? `${p.bpm || ''} BPM · ${p.key || ''} · ${esc(p.engine || 'Neural')}` : `${p.bpm} BPM · ${esc(p.key)} · Scribe’s sketch`;",
    "  const meta = p.neural ? `${p.bpm || ''} BPM · ${p.key || ''} · ${esc(p.engine || 'Neural song')}` : `${p.bpm} BPM · ${esc(p.key)} · Sketch`;", 'card-meta');
rep("  $('#all-projects').innerHTML = filtered.length ? filtered.map(p => card(p, projects.indexOf(p))).join('') : '<div class=\"empty\">No folios here yet. Inscribe a sketch or mark one as favored in thy library.</div>';",
    "  $('#all-projects').innerHTML = filtered.length ? filtered.map(p => card(p, projects.indexOf(p))).join('') : '<div class=\"empty\">No songs here yet. Create one in Song Forge, make a quick sketch, or favorite a song from your library.</div>';", 'empty-lib');

fs.writeFileSync(file, a, 'utf8');
console.log('cleanup', n);
