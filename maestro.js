import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {inspectWav} from './audio.js';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile);
let cache=null,expires=0;
export async function maestroStatus(force=false){
  if(!force&&cache&&Date.now()<expires)return cache;
  try{
    const config=JSON.parse(await fs.readFile(path.join(os.homedir(),'.pinokio','config.json'),'utf8'));
    const cli=path.join(config.home,'bin','npm','node_modules','pterm','index.js');
    const {stdout}=await exec(process.execPath,[cli,'status','Maestro.git','--probe'],{timeout:15000,maxBuffer:1024*1024,windowsHide:true});
    const status=JSON.parse(stdout);
    if(!status.ready)throw Error(`Maestro is ${status.state||'offline'}. Start it in Pinokio, then check again.`);
    if(status.source?.local===false)throw Error('This adapter currently supports local Maestro installations.');
    const base=status.ready_url;
    const response=await fetch(new URL('/api/v1/models',base),{signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('Maestro model catalog is unavailable');
    const catalog=await response.json();
    const models=catalog.models.filter(m=>/^(ace_step|yue|minimax_music)/i.test(m.model_type)).map(m=>({id:m.model_type,name:m.name,description:m.description,downloaded:m.is_downloaded}));
    cache={connected:true,base,models,message:'Live model catalog connected through Pinokio.'};
  }catch(e){cache={connected:false,models:[],message:e.message.includes('ECONNREFUSED')?'Pinokio control plane is unreachable. Open Pinokio and start Maestro.':e.message.split('\n')[0]};}
  expires=Date.now()+15000;return cache;
}
export async function generateNeural(input){
  const status=await maestroStatus();if(!status.connected)throw Error(status.message);
  const model=status.models.find(m=>m.id===input.model);
  if(!model)throw Error('Choose a model from the live Maestro catalog.');
  if(!model.downloaded)throw Error(`${model.name} is not downloaded. Install its weights in Maestro, then refresh Engines. No download was started.`);
  const response=await fetch(new URL('/api/v1/director/generate-music',status.base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model_type:model.id,style:`${input.style}. ${input.prompt}. ${input.bpm} BPM, ${input.key}.`,lyrics:input.lyrics||'[Instrumental]',instrumental:!input.lyrics?.trim(),duration_seconds:input.duration,seed:input.seed,workspace:'Harpsachord'}),signal:AbortSignal.timeout(30*60*1000)});
  const result=await response.json();if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'Maestro generation failed');
  if(!result.filename)throw Error('Maestro returned no audio file');
  const extension=path.extname(result.filename).toLowerCase();if(!['.wav','.mp3','.flac','.ogg'].includes(extension))throw Error('Maestro returned an unsupported audio type');
  // Local D:-backed workspaces can be junctions. Maestro's gallery HTTP route
  // rejects workspace junctions outside its save root, so import only from the
  // explicitly configured output directory. Never read arbitrary returned paths.
  const config=JSON.parse(await fs.readFile(new URL('./config.json',import.meta.url),'utf8'));
  if(config.maestroOutputDir){
    const outputRoot=await fs.realpath(config.maestroOutputDir);
    const target=await fs.realpath(path.join(outputRoot,path.basename(result.filename)));
    if(!target.toLowerCase().startsWith((outputRoot+path.sep).toLowerCase()))throw Error('Audio output is outside the configured workspace');
    if((await fs.stat(target)).size>100*1024*1024)throw Error('Generated audio exceeds the 100 MB import limit');
    const bytes=await fs.readFile(target);return {bytes,extension,model:model.name,...inspectWav(bytes)};
  }
  const media=new URL('/api/v1/file/'+result.filename.split(/[\\/]/).map(encodeURIComponent).join('/'),status.base);media.searchParams.set('workspace','Harpsachord');
  const audio=await fetch(media,{signal:AbortSignal.timeout(120000)});if(!audio.ok)throw Error('Generation completed, but audio retrieval failed. Find the result in Maestro’s Harpsachord workspace.');
  const chunks=[];let size=0;for await(const chunk of audio.body){size+=chunk.length;if(size>100*1024*1024)throw Error('Generated audio exceeds the 100 MB import limit');chunks.push(Buffer.from(chunk));}
  const bytes=Buffer.concat(chunks);return {bytes,extension,model:model.name,...inspectWav(bytes)};
}
