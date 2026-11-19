import fs from 'node:fs';

function repFile(file, replacements) {
  let a = fs.readFileSync(file, 'utf8');
  let n = 0;
  for (const [label, old, neu] of replacements) {
    if (a.includes(old)) {
      a = a.split(old).join(neu);
      console.log('OK', label);
      n++;
    } else {
      console.error('MISS', label);
    }
  }
  // mojibake cleanup
  const cleaned = a.replaceAll('�?�', '…').replaceAll('A�', '·').replaceAll('�o�', '✦').replaceAll('�+-', '↗').replaceAll('�.�', '⏸');
  if (cleaned !== a) { console.log('OK mojibake-clean'); a = cleaned; n++; }
  fs.writeFileSync(file, a, 'utf8');
  console.log(file, 'changes', n);
}

repFile('public/app.js', [
  ['pattern-rendered', "    toast('Pattern rendered. Mix, FX, and solo/mute preserved.');", "    toast('Pattern rendered anew. Mix, adornment, and solo/mute kept.');"],
  ['render-btn-reset', "    if (btn) { btn.disabled = false; btn.textContent = 'Save & render �+-'; }", "    if (btn) { btn.disabled = false; btn.textContent = 'Save & render ↗'; }"],
  ['reset-toast', "  toast('Reverted to last rendered pattern (draft). Save & render to apply audio.');", "  toast('Marks restored to the last rendered pattern (draft). Save & render to renew the sound.');"],
  ['model-dir-will', "      if (separatorInfo.modelDir) parts.push('Model dir: ' + separatorInfo.modelDir + (separatorInfo.modelDirExists ? '' : ' (will be created)'));", "      if (separatorInfo.modelDir) parts.push('Model dir: ' + separatorInfo.modelDir + (separatorInfo.modelDirExists ? '' : ' (will be fashioned)'));"],
  ['meta-join', "      metaEl.textContent = parts.join(' A� ');", "      metaEl.textContent = parts.join(' · ');"],
  ['audio-loading-reason', "  if (loading || !buffers.length) return 'Audio is still loading�?�';", "  if (loading || !buffers.length) return 'The voices are still being read…';"],
  ['sep-busy-reason', "  if (separatorInfo?.busy) return 'A background job is already running. Wait for it to finish.';", "  if (separatorInfo && separatorInfo.busy) return 'A task is already at work in the background. Await its finish.';"],
  ['add-busy-before-unavail-anchor', "  if (separatorInfo && separatorInfo.available === false) return separatorInfo.note || 'No local parting apparatus found. Set config.separatorExe or install audio-separator.';\n  return null;", "  if (separatorInfo && separatorInfo.busy) return 'A task is already at work in the background. Await its finish.';\n  if (separatorInfo && separatorInfo.available === false) return separatorInfo.note || 'No local parting apparatus found. Set config.separatorExe or install audio-separator.';\n  return null;"],
  ['render-state-failed-maybe', "    $('#save-state').textContent = 'Rendering failed';", "    $('#save-state').textContent = 'Rendering failed';"],
]);

// de-dup busy check if inserted twice
let a = fs.readFileSync('public/app.js', 'utf8');
const dup = "  if (separatorInfo && separatorInfo.busy) return 'A task is already at work in the background. Await its finish.';\n  if (separatorInfo && separatorInfo.busy) return 'A task is already at work in the background. Await its finish.';";
if (a.includes(dup)) {
  a = a.replace(dup, "  if (separatorInfo && separatorInfo.busy) return 'A task is already at work in the background. Await its finish.';");
  fs.writeFileSync('public/app.js', a, 'utf8');
  console.log('OK dedup-busy');
}

// Ensure render button text in HTML/script contexts is clean (already in app.js reset path, but also initial state in index.html is fine)

repFile('server.js', [
  ['server-log', "console.log(`Harpsachord is playing at http://127.0.0.1:${port}`);", "console.log(`Kitharaion atelier is open at http://127.0.0.1:${port}`);"],
  ['restart-msg', "check Harpsachord/Maestro workspaces for any completed output before retrying.", "check Kitharaion/Maestro workspaces for any completed output before retrying."],
]);

repFile('start.js', [
  ['start-log', "console.log('Harpsachord: '+url+' | Data: '+config.dataDir);", "console.log('Kitharaion: '+url+' | Data: '+config.dataDir);"],
]);

// README title/intro touch-up (light rebrand)
repFile('README.md', [
  ['title', '# Harpsachord', '# Kitharaion'],
  ['intro1', 'A local music studio prototype built in `C:\\Users\\PreSafu\\Desktop\\harpsachord`, inspired by prompt-to-song and browser-studio workflows (e.g. Bagpipes/Suno-style creation). This is an **original local implementation**, not a fork of proprietary source code, models, or hosted services.', 'A local music atelier prototype (Greek 1500s-inspired GUI) built in `C:\\Users\\PreSafu\\Desktop\\harpsachord`. Formerly codenamed Harpsachord. This is an **original local implementation**, not a fork of proprietary source code, models, or hosted services.'],
  ['start1', '1. **Harpsachord only (sketch engine):**', '1. **Kitharaion only (scribe’s sketch engine):**'],
  ['startcmd', '- Double-click `Start Harpsachord.cmd`, or run `node start.js` from this folder.', '- Double-click `Start Harpsachord.cmd`, or run `node start.js` from this folder.'],
]);
