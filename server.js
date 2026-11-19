import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {render,wav,defaultDrumPattern} from './synth.js';
import {maestroStatus,generateNeural} from './maestro.js';
import {inspectWav} from './audio.js';
const exec=promisify(execFile);
const root=path.dirname(fileURLToPath(import.meta.url));
let config={};try{config=JSON.parse(await fs.readFile(path.join(root,'config.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const data=process.env.HARPSACHORD_DATA_DIR||config.dataDir||path.join(root,'data');
const HOST=process.env.HARP_HOST||process.env.HOST||config.host||'127.0.0.1';
const PORT=Number(process.env.PORT||config.port||3210);
const ACCESS_TOKEN=String(process.env.HARP_ACCESS_TOKEN||config.accessToken||'').trim();
const ALLOWED_ORIGINS=String(process.env.HARP_ALLOWED_ORIGINS||config.allowedOrigins||'').split(',').map(s=>s.trim()).filter(Boolean);
const VERSION='0.1.0';
await fs.mkdir(path.join(data,'audio'),{recursive:true});
await fs.mkdir(path.join(data,'jobs'),{recursive:true});
const db=path.join(data,'projects.json');
const dfx=()=>({pan:0,low:0,high:1,delay:0,reverb:0});

function normalizeDrumPattern(pat, totalSteps){
  const lanes=['kick','snare','hat']; const out={version:1,stepsPerBeat:4,drums:{}};
  const src=pat&&typeof pat==='object'?pat:{}; out.stepsPerBeat=Number(src.stepsPerBeat)===4?4:4;
  const d=src.drums&&typeof src.drums==='object'?src.drums:{};
  for(const lane of lanes){ const a=Array.isArray(d[lane])?d[lane]:[]; out.drums[lane]=Array.from({length:totalSteps},(_,i)=>a[i]?1:0); }
  return out;
}
function sketchTotalSteps(p){ const beat=60/(Number(p.bpm)||92); return Math.max(1,Math.ceil((Number(p.duration)||24)/beat*4)); }

function ensureProject(p){
  if(!Array.isArray(p.stems))p.stems=[];
  const n=p.stems.length||0;
  if(!Array.isArray(p.volumes)||p.volumes.length!==n)p.volumes=Array.from({length:n},(_,i)=>p.volumes?.[i]??.8);
  if(!Array.isArray(p.mutes)||p.mutes.length!==n)p.mutes=Array.from({length:n},(_,i)=>!!p.mutes?.[i]);
  if(!Array.isArray(p.solos)||p.solos.length!==n)p.solos=Array.from({length:n},(_,i)=>!!p.solos?.[i]);
  if(!Array.isArray(p.fx)||p.fx.length!==n)p.fx=Array.from({length:n},(_,i)=>({ ...dfx(), ...(p.fx?.[i]&&typeof p.fx[i]==='object'?p.fx[i]:{}) }));
  p.fx=p.fx.map(f=>({pan:Math.max(-1,Math.min(1,+f.pan||0)),low:Math.max(0,Math.min(1,+f.low||0)),high:Math.max(0,Math.min(1,f.high??1)),delay:Math.max(0,Math.min(1,+f.delay||0)),reverb:Math.max(0,Math.min(1,+f.reverb||0))}));
  if(!p.neural && !p.imported && typeof p.bpm==='number'){
    const total=sketchTotalSteps(p);
    if(!p.pattern) p.pattern=defaultDrumPattern(p);
    p.pattern=normalizeDrumPattern(p.pattern,total);
  }
  return p;
}

let projects; try{projects=JSON.parse(await fs.readFile(db,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;projects=[];}
projects.forEach(ensureProject);
let writing=Promise.resolve();
function persist(){const snapshot=JSON.stringify(projects,null,2);writing=writing.then(async()=>{await fs.writeFile(db+'.tmp',snapshot);await fs.rename(db+'.tmp',db);});return writing;}
try{ await persist(); }catch(e){ console.error('Initial persist failed:',e.message); }

function validateSketchSettings(p){
  if(p.bpm<50||p.bpm>180||p.duration<8||p.duration>60||!['A minor','C major','D minor','E minor'].includes(p.key)) throw new Error('Use 50–180 BPM, 8–60 seconds, and a supported key.');
}
async function renderSketchProject(p){
  const audio=render(p);const names=['Drums','Bass','Atmosphere','Melody'];p.stems=[];
  for(let i=0;i<4;i++){const file=`${p.id}-${i}.wav`;await fs.writeFile(path.join(data,'audio',file),wav(audio.stems[i]));p.stems.push({name:names[i],url:'/audio/'+file});}
  p.url='/audio/'+p.id+'.wav';await fs.writeFile(path.join(data,'audio',p.id+'.wav'),wav(audio.mix));
  p.pattern=audio.pattern||p.pattern;
  p.engine='Procedural sketch'; p.neural=false; p.imported=false;
  if(!Array.isArray(p.volumes)||p.volumes.length!==4) p.volumes=[.8,.8,.8,.8];
  if(!Array.isArray(p.mutes)||p.mutes.length!==4) p.mutes=[false,false,false,false];
  if(!Array.isArray(p.solos)||p.solos.length!==4) p.solos=[false,false,false,false];
  if(!Array.isArray(p.fx)||p.fx.length!==4) p.fx=[dfx(),dfx(),dfx(),dfx()];
  return ensureProject(p);
}
async function generate(input){
  const p={id:randomUUID(),title:String(input.title||'Untitled session').slice(0,100),prompt:String(input.prompt||'').slice(0,2000),style:String(input.style||'Lo-fi').slice(0,60),bpm:Number(input.bpm)||92,duration:Number(input.duration)||24,key:input.key||'A minor',seed:Number(input.seed)||1,created:new Date().toISOString(),favorite:false};
  validateSketchSettings(p); await renderSketchProject(p); projects.unshift(p); await persist(); return p;
}
if(!projects.length) await generate({title:'After hours, somewhere',prompt:'Dusty drums, warm Rhodes, a late-night walk through the city',style:'Lo-fi',bpm:92,duration:24,key:'A minor',seed:42});

function corsOrigin(req){const o=req.headers.origin;if(!o)return '';if(ALLOWED_ORIGINS.includes('*')||ALLOWED_ORIGINS.includes(o))return o;return '';}
function withCors(req,res,extra={}){const o=corsOrigin(req);const h={...extra};if(o){h['Access-Control-Allow-Origin']=o;h['Access-Control-Allow-Methods']='GET,POST,PATCH,OPTIONS,HEAD';h['Access-Control-Allow-Headers']='Content-Type, Authorization, X-Harp-Token';h['Vary']='Origin';}return h;}
function json(res,status,value,req,extra={}){const h=withCors(req||{},res,{'Content-Type':'application/json',...extra});res.writeHead(status,h);res.end(JSON.stringify(value));}
async function body(req){let s='';for await(const chunk of req){s+=chunk;if(s.length>20000)throw new Error('Request too large');}return JSON.parse(s||'{}');}
function requestToken(req,u){const auth=req.headers.authorization||'';if(auth.toLowerCase().startsWith('bearer '))return auth.slice(7).trim();return String(req.headers['x-harp-token']||u?.searchParams?.get('token')||'').trim();}
function isAuthorized(req,u){if(!ACCESS_TOKEN)return true;return requestToken(req,u)===ACCESS_TOKEN;}
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.wav':'audio/wav','.mp3':'audio/mpeg','.flac':'audio/flac','.ogg':'audio/ogg','.md':'text/plain'};
let neuralBusy=false,activeJob=null;

async function runNeuralJob(input,id){
  const jobPath=path.join(data,'jobs',id+'.json');
  try{
    const audio=await generateNeural(input),file=id+audio.extension;
    await fs.writeFile(path.join(data,'audio',file),audio.bytes);
    const p=ensureProject({id,title:String(input.title||'AI session').slice(0,100),prompt:input.prompt,lyrics:input.lyrics,style:String(input.style||'AI music'),bpm:input.bpm,duration:audio.duration||input.duration,sampleRate:audio.sampleRate,key:String(input.key||''),seed:input.seed,created:new Date().toISOString(),engine:audio.model,neural:true,favorite:false,volumes:[.8],mutes:[false],solos:[false],fx:[dfx()],url:'/audio/'+file,stems:[{name:'Full song',url:'/audio/'+file}]});
    projects.unshift(p);await persist();await fs.writeFile(jobPath,JSON.stringify({id,status:'completed',project:p}));
  }catch(e){console.error('Neural job failed:',e.message);await fs.writeFile(jobPath,JSON.stringify({id,status:'failed',error:e.message}));}
  finally{neuralBusy=false;activeJob=null;}
}

// Neural stem separation (best-effort, uses Maestro's bundled audio-separator if available)
let separationBusy=false;
const DEFAULT_SEP_MODEL='model_bs_roformer_ep_317_sdr_12.9755.ckpt';
function separatorModelDir(){ return config.separatorModelDir||path.join(config.modelDir||path.join('D:','Harpsachord','models'),'audio-separator'); }
async function findSeparator(){
  const candidates=[
    config.separatorExe,
    path.join('C:','pinokio','api','Maestro.git','app','env','Scripts','audio-separator.exe'),
  ].filter(Boolean);
  for(const c of candidates){ try{ await fs.access(c); return c; }catch{} }
  return null;
}
async function separatorStatus(){
  const exe=await findSeparator();
  const modelDir=separatorModelDir();
  let modelDirExists=false; try{ await fs.access(modelDir); modelDirExists=true; }catch{}
  return {
    available:!!exe,
    exe: exe || null,
    exeLabel: exe ? path.basename(path.dirname(path.dirname(exe)))+'/env/.../audio-separator.exe' : null,
    modelDir, modelDirExists,
    defaultModel: DEFAULT_SEP_MODEL,
    busy: separationBusy || neuralBusy,
    note: exe
      ? 'Local audio-separator found. First run may download the selected model into the model directory and can take several minutes.'
      : 'No local audio-separator found. Install audio-separator or point config.separatorExe to it (Maestro bundle expected at C:\\pinokio\\api\\Maestro.git\\app\\env\\Scripts\\audio-separator.exe).'
  };
}
async function runSeparationJob(projectId,id,model){
  const jobPath=path.join(data,'jobs',id+'.json');
  try{
    const p=projects.find(x=>x.id===projectId); if(!p) throw Error('Source session not found');
    const srcUrl=p.url||p.stems?.[0]?.url; if(!srcUrl) throw Error('No audio to separate in this session');
    const srcRel=srcUrl.replace(/^\/audio\//,''); const srcPath=path.join(data,'audio',srcRel);
    await fs.access(srcPath).catch(()=>{ throw Error('Source audio file is missing from local storage.'); });
    const sepExe=await findSeparator();
    if(!sepExe) throw Error('No stem separator found. Install audio-separator or set config.separatorExe (Maestro bundle: C:\\pinokio\\api\\Maestro.git\\app\\env\\Scripts\\audio-separator.exe).');

    const outDir=path.join(data,'audio','separated',id);
    await fs.mkdir(outDir,{recursive:true});
    const modelName=(model||DEFAULT_SEP_MODEL).trim()||DEFAULT_SEP_MODEL;
    const args=['-m',modelName,'--output_dir',outDir,'--output_format','WAV',srcPath];
    const mdir=separatorModelDir();
    try{ await fs.mkdir(mdir,{recursive:true}); args.splice(2,0,'--model_file_dir',mdir);}catch{}

    await exec(sepExe,args,{timeout:60*60*1000,maxBuffer:50*1024*1024,windowsHide:true}).catch(e=>{
      const raw=((e.stderr||'')+'\n'+(e.stdout||'')+'\n'+(e.message||'')).toString();
      const lines=raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      const tail=lines.slice(-10).join(' | ').slice(0,900);
      throw Error(tail||'Separation failed (no details). Check that the model name is valid and the separator environment is healthy.');
    });

    const files=(await fs.readdir(outDir)).filter(f=>/\.wav$/i.test(f));
    if(!files.length) throw Error('Separation finished but produced no WAV files. The chosen model may be incompatible with this audio or environment.');
    const mapName=f=>{ const l=f.toLowerCase(); if(/vocal/.test(l)) return 'Vocals'; if(/drum/.test(l)) return 'Drums'; if(/bass/.test(l)) return 'Bass'; if(/other|instrum|piano|guitar/.test(l)) return 'Other'; return path.basename(f,'.wav').replace(/[_-]+/g,' ').trim()||'Stem'; };
    const picked=[]; const prefer=['Vocals','Drums','Bass','Other'];
    for(const name of prefer){ const f=files.find(x=>mapName(x)===name && !picked.includes(x)); if(f) picked.push(f); }
    for(const f of files){ if(!picked.includes(f)) picked.push(f); }
    const stems=[]; let duration=p.duration||0, sampleRate=p.sampleRate||44100;
    for(let i=0;i<picked.length;i++){
      const f=picked[i]; const srcF=path.join(outDir,f); const destName=`${id}-${i}.wav`; const dest=path.join(data,'audio',destName);
      await fs.copyFile(srcF,dest);
      const buf=await fs.readFile(dest); const info=inspectWav(buf)||{};
      if(info.duration) duration=Math.max(duration,info.duration); if(info.sampleRate) sampleRate=info.sampleRate;
      stems.push({name:mapName(f),url:'/audio/'+destName});
    }
    const np=ensureProject({id,title:`${p.title} (stems)`.slice(0,100),prompt:p.prompt,lyrics:p.lyrics,style:p.style||'Separated',bpm:p.bpm,duration,sampleRate,key:p.key||'',seed:p.seed,created:new Date().toISOString(),engine:`Separated (${modelName.replace(/\.(ckpt|pth|onnx|yaml)$/i,'')})`,neural:true,separated:true,sourceProjectId:projectId,favorite:false,volumes:stems.map(()=>.8),mutes:stems.map(()=>false),solos:stems.map(()=>false),fx:stems.map(()=>dfx()),url:stems[0]?.url,stems});
    projects.unshift(np); await persist(); await fs.writeFile(jobPath,JSON.stringify({id,status:'completed',project:np}));
  }catch(e){console.error('Separation job failed:',e);await fs.writeFile(jobPath,JSON.stringify({id,status:'failed',error:(e&&e.message)||String(e)}));}
  finally{separationBusy=false; if(activeJob===id) activeJob=null;}
}
const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://localhost'), route=u.pathname;

    // CORS preflight (for hosted/web skins when allowed origins are configured)
    if(req.method==='OPTIONS'){
      const o=corsOrigin(req);
      if(!o && req.headers.origin) return json(res,403,{error:'Cross-origin request rejected'},req);
      res.writeHead(204, withCors(req,res)); return res.end();
    }

    // Origin / auth checks for API and audio (data) routes
    if(route.startsWith('/api/') || route.startsWith('/audio/')){
      if(req.headers.origin){
        const o=corsOrigin(req);
        const sameHost=`http://${req.headers.host}`;
        if(!o && req.headers.origin!==sameHost) return json(res,403,{error:'Cross-origin request rejected'},req);
      }
      if(!isAuthorized(req,u)) return json(res,401,{error:'Unauthorized'},req,{'WWW-Authenticate':'Bearer realm="harp"'});
    }

    if(route==='/api/health'&&req.method==='GET') return json(res,200,{ok:true,service:'harp-studio',version:VERSION,host:HOST,port:PORT,auth:!!ACCESS_TOKEN,busy:{neural:neuralBusy,separation:separationBusy}},req);
    if(route==='/api/projects'&&req.method==='GET')return json(res,200,projects,req);
    if(route==='/api/generate'&&req.method==='POST'){try{return json(res,201,await generate(await body(req)),req);}catch(e){return json(res,400,{error:e.message},req);}}
    if(route.startsWith('/api/projects/')&&route.endsWith('/render')&&req.method==='POST'){
      const id=route.split('/')[3];const p=projects.find(p=>p.id===id);if(!p)return json(res,404,{error:'Session not found'},req);
      if(p.neural||p.imported) return json(res,400,{error:'Only procedural sketch sessions can be re-rendered.'},req);
      const edit=await body(req);
      if(edit.pattern&&typeof edit.pattern==='object') p.pattern=normalizeDrumPattern(edit.pattern,sketchTotalSteps(p));
      if(typeof edit.bpm==='number'){p.bpm=edit.bpm;} if(typeof edit.duration==='number'){p.duration=edit.duration;} if(typeof edit.key==='string'){p.key=edit.key;}
      try{validateSketchSettings(p);}catch(e){return json(res,400,{error:e.message},req);}
      if(edit.pattern&&typeof edit.pattern==='object') p.pattern=normalizeDrumPattern(edit.pattern,sketchTotalSteps(p));
      await renderSketchProject(p); await persist(); return json(res,200,p,req);
    }
    if(route.startsWith('/api/projects/')&&req.method==='PATCH'){
      const p=projects.find(p=>p.id===route.split('/').pop());if(!p)return json(res,404,{error:'Session not found'},req);const edit=await body(req);
      if(typeof edit.title==='string')p.title=edit.title.slice(0,100);
      if(typeof edit.favorite==='boolean')p.favorite=edit.favorite;
      if(Array.isArray(edit.volumes)&&edit.volumes.length===p.stems.length&&edit.volumes.every(v=>typeof v==='number'&&v>=0&&v<=1))p.volumes=edit.volumes;
      if(Array.isArray(edit.mutes)&&edit.mutes.length===p.stems.length&&edit.mutes.every(v=>typeof v==='boolean'))p.mutes=edit.mutes;
      if(Array.isArray(edit.solos)&&edit.solos.length===p.stems.length&&edit.solos.every(v=>typeof v==='boolean'))p.solos=edit.solos;
      if(Array.isArray(edit.fx)&&edit.fx.length===p.stems.length&&edit.fx.every(f=>f&&typeof f==='object')){
        p.fx=edit.fx.map(f=>({pan:Math.max(-1,Math.min(1,+f.pan||0)),low:Math.max(0,Math.min(1,+f.low||0)),high:Math.max(0,Math.min(1,f.high??1)),delay:Math.max(0,Math.min(1,+f.delay||0)),reverb:Math.max(0,Math.min(1,+f.reverb||0))}));
      }
      if(edit.pattern&&typeof edit.pattern==='object'&&!p.neural&&!p.imported){
        p.pattern=normalizeDrumPattern(edit.pattern,sketchTotalSteps(p));
      }
      await persist();return json(res,200,ensureProject(p),req);
    }
    if(route==='/api/separator'&&req.method==='GET') return json(res,200,await separatorStatus(),req);
    if(route==='/api/separate'&&req.method==='POST'){
      const input=await body(req); const projectId=String(input.projectId||'');
      if(!/^[a-f0-9-]{36}$/.test(projectId)) return json(res,400,{error:'Invalid session id'},req);
      const p=projects.find(x=>x.id===projectId); if(!p) return json(res,404,{error:'Session not found'},req);
      if(p.imported) return json(res,400,{error:'Imported browser-only audio cannot be separated from here. Use a stored session.'},req);
      if(!(p.url||p.stems?.[0]?.url)) return json(res,400,{error:'This session has no audio to separate.'},req);
      if(separationBusy||neuralBusy) return json(res,409,{error:'Another background job is already running. Wait for it to finish.'},req);
      separationBusy=true;
      const id=randomUUID(); activeJob=id;
      const model=typeof input.model==='string'?input.model.slice(0,200).trim():undefined;
      const stemsHint=typeof input.stems==='string'?input.stems.slice(0,120).trim():undefined;
      await fs.writeFile(path.join(data,'jobs',id+'.json'),JSON.stringify({id,status:'running',type:'separation',sourceProjectId:projectId,started:new Date().toISOString(),model:model||DEFAULT_SEP_MODEL,stems:stemsHint||''}));
      runSeparationJob(projectId,id,model).catch(e=>console.error('Separation record failure:',e));
      return json(res,202,{id,status:'running',type:'separation'},req);
    }
    if(route==='/api/maestro'&&req.method==='GET')return json(res,200,await maestroStatus(u.searchParams.has('refresh')),req);
    if(route.startsWith('/api/jobs/')&&req.method==='GET'){
      const id=route.split('/').pop();if(!/^[a-f0-9-]{36}$/.test(id))return json(res,400,{error:'Invalid job ID'},req);
      let job;try{job=JSON.parse(await fs.readFile(path.join(data,'jobs',id+'.json'),'utf8'));}catch{return json(res,404,{error:'Job not found'},req);}
      if(job.status==='running'&&activeJob!==id)job={...job,status:'failed',error:'The studio restarted during this job. Check Kitharaion/Maestro workspaces for any completed output before retrying.'};
      return json(res,200,job,req);
    }
    if(route==='/api/neural'&&req.method==='POST'){
      const input=await body(req);
      if(typeof input.prompt!=='string'||input.prompt.length>2000||typeof input.lyrics!=='string'||input.lyrics.length>8000||!Number.isFinite(input.duration)||input.duration<8||input.duration>240||!Number.isFinite(input.bpm)||input.bpm<50||input.bpm>200)return json(res,400,{error:'Invalid music request. Use 8–240 seconds and 50–200 BPM.'},req);
      if(neuralBusy||separationBusy)return json(res,409,{error:'Another background job is already running. Wait for it to finish.'},req);
      neuralBusy=true;
      try{
        const status=await maestroStatus(),model=status.models.find(m=>m.id===input.model);
        if(!status.connected||!model?.downloaded){neuralBusy=false;return json(res,400,{error:status.connected?'This music model is not downloaded. Install it in Maestro, then refresh Engines.':status.message},req);}
        const id=randomUUID();activeJob=id;await fs.writeFile(path.join(data,'jobs',id+'.json'),JSON.stringify({id,status:'running',type:'neural',started:new Date().toISOString()}));
        runNeuralJob(input,id).catch(e=>console.error('Job record failure:',e));return json(res,202,{id,status:'running'},req);
      }catch(e){neuralBusy=false;activeJob=null;return json(res,400,{error:e.message},req);}
    }
    if(route==='/api/system'){
      let pinokio=false;try{const r=await fetch('http://127.0.0.1:42000',{signal:AbortSignal.timeout(1800)});pinokio=r.ok;}catch{}
      return json(res,200,{ramGB:Math.round(os.totalmem()/2**30),dataDir:data,pinokio,engine:'Procedural sketch',aiConnected:false,host:HOST,auth:!!ACCESS_TOKEN,version:VERSION},req);
    }
    if(route.startsWith('/api/'))return json(res,404,{error:'Unknown API route'},req);

    const base=route.startsWith('/audio/')?path.join(data,'audio'):path.join(root,'public');
    const rel=route.startsWith('/audio/')?route.slice(7):route==='/'?'index.html':decodeURIComponent(route.slice(1));
    const target=path.resolve(base,rel);if(!target.startsWith(base+path.sep))return json(res,403,{error:'Forbidden'},req);
    let buffer;try{buffer=await fs.readFile(target);}catch{return json(res,404,{error:'Not found'},req);}
    res.writeHead(200,withCors(req,res,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Content-Length':buffer.length,'X-Content-Type-Options':'nosniff'}));res.end(req.method==='HEAD'?undefined:buffer);
  }catch(e){console.error(e);json(res,500,{error:'Local server error'},req);}
});
server.listen(PORT,HOST,()=>{
  const loopback=HOST==='127.0.0.1'||HOST==='localhost'||HOST==='::1';
  console.log(`HARP/Kitharaion studio is open at http://${HOST}:${PORT} (auth=${ACCESS_TOKEN?'on':'off'}, loopback=${loopback})`);
  if(!loopback && !ACCESS_TOKEN) console.warn('WARNING: server is exposed on a non-loopback host without HARP_ACCESS_TOKEN. Set a token before sharing/remote access.');
});
