// Small deterministic instrumental sketch renderer. This is synthesis, not a neural model.
export const sampleRate = 22050;
export function defaultFx(){return {pan:0,low:0,high:1,delay:0,reverb:0};}
export function hash(text) { let h=2166136261; for(const c of String(text)) h=Math.imul(h^c.charCodeAt(0),16777619); return h>>>0; }
function rng(seed){ let r=seed||1; return ()=>{r^=r<<13;r^=r>>>17;r^=r<<5;return (r>>>0)/4294967296;}; }

export function wav(samples, rate=sampleRate) {
  const b=Buffer.alloc(44+samples.length*2); b.write('RIFF'); b.writeUInt32LE(b.length-8,4); b.write('WAVEfmt ',8); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(rate,24); b.writeUInt32LE(rate*2,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(samples.length*2,40);
  for(let i=0;i<samples.length;i++) b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),44+i*2); return b;
}

function normalizeDrums(input, totalSteps){
  const lanes=['kick','snare','hat'];
  const src=input&&typeof input==='object'?input:{};
  const out={};
  for(const lane of lanes){
    const a=Array.isArray(src[lane])?src[lane]:[];
    out[lane]=Array.from({length:totalSteps},(_,i)=>a[i]?1:0);
  }
  return out;
}

export function defaultDrumPattern({prompt='',bpm=92,duration=24,key='A minor',seed=1,style='Lo-fi'}={}){
  const beat=60/(Number(bpm)||92), stepsPerBeat=4, totalSteps=Math.max(1,Math.ceil((Number(duration)||24)/beat*stepsPerBeat));
  const rand=rng(hash(prompt+seed+style)||1);
  const bright=/house|electronic|synth/i.test(style+' '+prompt), ambient=/ambient/i.test(style);
  const drums={kick:Array(totalSteps).fill(0),snare:Array(totalSteps).fill(0),hat:Array(totalSteps).fill(0)};
  for(let b=0;b*beat<duration;b++){
    // mirror melodic RNG consumption so pattern derivation is stable/deterministic
    for(let h=0;h<2;h++) if(rand()>(ambient?.55:.18)) rand();
    if(ambient) continue;
    const kick=bright||b%4===0||b%4===2, snare=b%4===1||b%4===3;
    const s0=b*stepsPerBeat;
    if(kick && s0<totalSteps) drums.kick[s0]=1;
    if(snare && s0<totalSteps) drums.snare[s0]=1;
    for(let h=0;h<2;h++){ const hs=s0+h*2; if(hs<totalSteps) drums.hat[hs]=1; }
  }
  return {version:1,stepsPerBeat,drums};
}

export function render(input={}) {
  const {prompt='',bpm=92,duration=24,key='A minor',seed=1,style='Lo-fi',pattern=null} = input;
  const n=Math.floor(duration*sampleRate), stems=Array.from({length:4},()=>new Float32Array(n));
  const rand=rng(hash(prompt+seed+style)||1);
  const beat=60/bpm, root=({'A minor':45,'C major':48,'D minor':50,'E minor':40})[key]??45;
  const major=key.includes('major'), progression=major?[0,7,9,5]:[0,5,8,3], third=major?4:3;
  const bright=/house|electronic|synth/i.test(style+' '+prompt), ambient=/ambient/i.test(style);
  const stepsPerBeat=4, totalSteps=Math.max(1,Math.ceil(duration/beat*stepsPerBeat));
  const customDrums = pattern?.drums && typeof pattern.drums==='object' ? normalizeDrums(pattern.drums,totalSteps) : null;
  const genDrums = {kick:Array(totalSteps).fill(0),snare:Array(totalSteps).fill(0),hat:Array(totalSteps).fill(0)};

  function note(track,start,len,midi,vol,kind){
    const f=440*Math.pow(2,(midi-69)/12), first=Math.floor(start*sampleRate), count=Math.floor(len*sampleRate);
    for(let j=0;j<count&&first+j<n;j++) {const t=j/sampleRate, tail=Math.min(1,(count-j)/(sampleRate*.15)), attack=Math.min(1,t/(kind==='pad'?.12:.009));
      let v=Math.sin(2*Math.PI*f*t);
      if(kind==='keys') v=(v+.32*Math.sin(2*Math.PI*f*2*t)+.14*Math.sin(2*Math.PI*f*3*t))*Math.exp(-t*3);
      if(kind==='bass') v=(v+.2*Math.sin(2*Math.PI*f*2*t))*Math.exp(-t*1.7);
      if(kind==='pad') v=(v+.3*Math.sin(2*Math.PI*f*1.003*t))*.6;
      stems[track][first+j]+=v*vol*attack*tail;
    }
  }

  for(let b=0;b*beat<duration;b++){
    const chord=progression[Math.floor(b/8)%4], start=b*beat;
    if(b%4===0) for(const step of [0,third,7,10]) note(2,start,beat*3.8,root+chord+12+step,.065,'pad');
    if(b%2===0) note(1,start,beat*1.7,root+chord-12,.22,'bass');
    for(let h=0;h<2;h++) if(rand()>(ambient?.55:.18)) {const scale=major?[0,2,4,7,9,12]:[0,3,5,7,10,12];note(3,start+h*beat/2,beat*1.4,root+chord+24+scale[Math.floor(rand()*scale.length)],bright?.12:.095,'keys');}
    if(!customDrums && !ambient){
      const kick=bright||b%4===0||b%4===2, snare=b%4===1||b%4===3;
      const s0=b*stepsPerBeat;
      if(kick && s0<totalSteps) genDrums.kick[s0]=1;
      if(snare && s0<totalSteps) genDrums.snare[s0]=1;
      for(let h=0;h<2;h++){ const hs=s0+h*2; if(hs<totalSteps) genDrums.hat[hs]=1; }
    }
  }

  const drums = customDrums || genDrums;
  const stepDur = beat/stepsPerBeat;
  function hitRand(kind, s){ return rng(hash(`${seed}|${prompt}|${style}|${kind}|${s}`)); }
  for(let s=0;s<totalSteps;s++){
    const t0=s*stepDur; if(t0>=duration) break;
    const first=Math.floor(t0*sampleRate);
    if(drums.kick[s]){
      for(let j=0;j<sampleRate*.22&&first+j<n;j++){const t=j/sampleRate;stems[0][first+j]+=Math.sin(2*Math.PI*(48*t+8*(1-Math.exp(-t*30))))*Math.exp(-t*23)*.45;}
    }
    if(drums.snare[s]){
      const rr=hitRand('snare',s);
      for(let j=0;j<sampleRate*.22&&first+j<n;j++){const t=j/sampleRate;stems[0][first+j]+=(rr()*2-1)*Math.exp(-t*27)*.2;}
    }
    if(drums.hat[s]){
      const rr=hitRand('hat',s);
      for(let j=0;j<sampleRate*.045&&first+j<n;j++){const t=j/sampleRate;stems[0][first+j]+=(rr()*2-1)*Math.exp(-t*100)*.065;}
    }
  }

  // A light musical echo, followed by a clean fade at both ends.
  const echoDelay=Math.floor(beat*.75*sampleRate);
  for(let i=echoDelay;i<n;i++) stems[3][i]+=stems[3][i-echoDelay]*.23;
  const mix=new Float32Array(n);
  for(let i=0;i<n;i++){const fade=Math.min(1,i/(sampleRate*.03),(n-i)/(sampleRate*.8));for(const stem of stems){stem[i]*=fade;mix[i]+=stem[i];}}
  return {stems,mix,pattern:{version:1,stepsPerBeat,drums}};
}
