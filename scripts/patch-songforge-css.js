import fs from 'node:fs';

const cssPath = 'public/style.css';
let css = fs.readFileSync(cssPath, 'utf8');

const extra = `

/* --- Song Forge (create flow) --- */
.forge-heading p{max-width:980px}
.song-forge-panel{padding:22px 24px;margin-bottom:22px;background:linear-gradient(180deg,rgba(251,246,232,.98),rgba(244,232,200,.96))}
.forge-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}
.forge-title{display:flex;gap:12px;align-items:flex-start}
.forge-title .spark{font-size:22px;margin-top:2px}
.forge-title h2{font-size:26px;margin:0}
.forge-title p{margin:4px 0 0;color:var(--muted);font-style:italic}
.forge-top-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}
.forge-connection{font-size:11px;font-family:'Cinzel',serif;letter-spacing:.4px;color:#5a4a32;background:#efe7d2;border:1px solid #cdbb93;padding:6px 10px;border-radius:4px}
.forge-connection.ok{background:#e6efcf;border-color:#b8c99a;color:#3f5228}
.forge-connection.bad{background:#f3e0da;border-color:#d1a79a;color:#6b3a2e}
.forge-form{display:grid;grid-template-columns:minmax(320px,1.35fr) minmax(300px,1fr);gap:18px}
.forge-main,.forge-side{min-width:0}
.forge-prompt{height:150px;font-size:16px}
.forge-lyrics{height:260px;line-height:1.7}
.forge-lyrics.disabled{opacity:.55;background:#efe7d2}
.forge-lyrics-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:14px}
.instrumental-toggle{font-size:12px;color:#5a4a32;display:flex;align-items:center;gap:8px;font-family:'Cinzel',serif;letter-spacing:.2px;white-space:nowrap}
.instrumental-toggle input{accent-color:#b8892e}
.forge-hint{font-size:12px;color:var(--muted);margin:8px 0 0;font-style:italic;line-height:1.6}
.forge-summary{font-size:13px;color:#5a4a32;margin:8px 0 0;line-height:1.6;font-style:italic}
.forge-count{font-weight:400;color:var(--muted);font-size:11px}
.forge-chips{display:flex;flex-direction:column;gap:8px;margin-top:6px;max-height:300px;overflow:auto;padding-right:2px}
.forge-chip{display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:left;padding:10px 12px;border:1px solid var(--line);border-radius:6px;background:var(--vellum);transition:background .15s,border-color .15s,box-shadow .15s}
.forge-chip:hover{background:#fff8e8;border-color:#c3a86a}
.forge-chip.active{background:linear-gradient(180deg,#f3e3b8,#e7d098);border-color:#b8943a;box-shadow:inset 0 1px 0 #f8efd2,0 0 0 1px rgba(184,137,46,.15)}
.forge-chip-name{font-weight:600;font-size:13px;font-family:'Cinzel',serif;color:#2f2418;line-height:1.3}
.forge-chip-tags{display:flex;gap:6px;flex-wrap:wrap}
.chip-tag{font-size:9px;letter-spacing:.8px;text-transform:uppercase;padding:2px 6px;border-radius:3px;border:1px solid #cdbb93;background:#efe7d2;color:#5a4a32;font-family:'Cinzel',serif}
.chip-tag.vocal{background:#efe0b8;border-color:#c9962e;color:#5a4316}
.chip-tag.ok{background:#e6efcf;border-color:#b8c99a;color:#4f5f36}
.forge-empty{padding:16px;font-size:13px}
.forge-settings{grid-template-columns:1fr 1fr 1fr;margin-top:10px}
.forge-generate{margin-top:14px;font-size:16px;padding:14px 16px}
.forge-side .neural-state{display:block;margin:10px 0 0;max-width:none}
.engine-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px}

/* Model catalog (engines view) */
.models-head{margin-bottom:6px}
.models-head h2{margin:10px 0 6px}
.model-list{margin-top:8px}
.model-row{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--line)}
.model-row-main{display:flex;flex-direction:column;gap:3px;min-width:0}
.model-row-name{font-weight:600;font-family:'Cinzel',serif;font-size:14px;color:#2f2418}
.model-desc{font-size:12px;color:#5a4a32;line-height:1.5;font-style:italic}
.model-tags{font-size:11px;color:var(--muted)}
.model-row-side{display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0}
.model-badge{font-size:9px;letter-spacing:1px;padding:4px 7px;border-radius:3px;border:1px solid #cdbb93;background:#efe7d2;color:#5a4a32;font-family:'Cinzel',serif}
.model-badge.ok{background:#e6efcf;border-color:#b8c99a;color:#3f5228}
.use-model{font-size:10px}

/* More tools / sketch */
.alt-tools{margin:0 0 22px;padding:0;overflow:hidden}
.alt-tools>summary{list-style:none;cursor:pointer;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-family:'Cinzel',serif;font-size:13px;color:#4a3a28;background:rgba(251,244,227,.6)}
.alt-tools>summary::-webkit-details-marker{display:none}
.alt-tools>summary:hover{background:rgba(239,224,184,.35)}
.alt-badge{font-size:9px;letter-spacing:1px;color:#5e6b3e;background:#e6efcf;border:1px solid #b8c99a;padding:4px 8px;border-radius:3px}
.alt-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:16px;padding:16px 20px 20px;border-top:1px solid var(--line)}
.alt-card{background:rgba(251,244,227,.5);border:1px solid rgba(205,187,147,.7);border-radius:6px;padding:16px}
.alt-desc{font-size:13px;color:#5a4a32;margin:6px 0 10px;font-style:italic}
.alt-actions{display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap}
#sketch-prompt{height:90px}
.compact-drop{min-height:160px;padding:18px 10px}
.idea-box{margin-top:12px;padding-top:10px;border-top:1px solid var(--line)}
.idea-box button{margin-top:6px;border:0;padding:0;font-size:13px;color:#4a3a28;font-family:'Cinzel',serif;text-align:left;width:100%}
.idea-box button span{float:right}
#footer-engine{font-style:normal}

/* Responsive additions for forge */
@media(max-width:1100px){.forge-form{grid-template-columns:1fr}.forge-lyrics{height:200px}.alt-grid{grid-template-columns:1fr}}
@media(max-width:740px){.forge-top{flex-direction:column}.forge-title h2{font-size:22px}.forge-settings{grid-template-columns:1fr 1fr}.song-forge-panel{padding:16px 14px}.forge-generate{font-size:15px}}
`;

if (!css.includes('/* --- Song Forge (create flow) --- */')) {
  css += extra;
  fs.writeFileSync(cssPath, css, 'utf8');
  console.log('css-appended', extra.length);
} else {
  console.log('css-already-present');
}
