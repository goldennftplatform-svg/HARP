import {spawn,execFile} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const config=JSON.parse(fs.readFileSync(path.join(root,'config.json'),'utf8'));
const logs=path.join(path.dirname(config.dataDir),'logs');fs.mkdirSync(logs,{recursive:true});
const url='http://127.0.0.1:3210';
async function alive(){try{return (await fetch(url+'/api/projects',{signal:AbortSignal.timeout(1500)})).ok;}catch{return false;}}
if(!await alive()){
  const out=fs.openSync(path.join(logs,'studio.log'),'a');
  const child=spawn(process.execPath,[path.join(root,'server.js')],{cwd:root,detached:true,stdio:['ignore',out,out],windowsHide:true});child.unref();fs.closeSync(out);
  let ready=false;for(let i=0;i<30;i++){if(await alive()){ready=true;break;}await new Promise(r=>setTimeout(r,500));}
  if(!ready)throw Error('Studio did not start. Check '+path.join(logs,'studio.log'));
}
console.log('Kitharaion: '+url+' | Data: '+config.dataDir);
// Start the UI through the Pinokio control plane when available; otherwise use the OS browser.
try{
  const pinokio=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.pinokio','config.json'),'utf8'));
  const cli=path.join(pinokio.home,'bin','npm','node_modules','pterm','index.js');
  await new Promise((resolve,reject)=>execFile(process.execPath,[cli,'open',url,'--preset','center-large'],{timeout:15000,windowsHide:true},e=>e?reject(e):resolve()));
}catch{const browser=spawn('cmd.exe',['/c','start','',url],{detached:true,stdio:'ignore',windowsHide:true});browser.unref();}
