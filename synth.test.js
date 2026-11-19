import test from 'node:test';
import assert from 'node:assert/strict';
import {render,wav,sampleRate,defaultFx,defaultDrumPattern} from './synth.js';

test('audio stems sum to mix, contain signal, and are reproducible',()=>{
  const settings={duration:8,seed:42,prompt:'warm jazz',style:'Jazz'};
  const a=render(settings),b=render(settings);
  assert.deepEqual(a.mix,b.mix);assert.equal(a.mix.length,sampleRate*8);
  for(const stem of a.stems){assert.ok(stem.some(v=>Math.abs(v)>.01));assert.ok(stem.every(Number.isFinite));}
  for(let i=0;i<a.mix.length;i+=101)assert.ok(Math.abs(a.stems.reduce((s,t)=>s+t[i],0)-a.mix[i])<1e-6);
  assert.notDeepEqual(a.mix,render({...settings,seed:43}).mix);
  assert.deepEqual(a.pattern,b.pattern);
  assert.equal(a.pattern.stepsPerBeat,4);
});

test('WAV header and duration agree with the rendered samples',()=>{
  const {mix}=render({duration:8});const output=wav(mix);
  assert.equal(output.toString('ascii',0,4),'RIFF');assert.equal(output.toString('ascii',8,12),'WAVE');
  assert.equal(output.readUInt32LE(24),sampleRate);assert.equal(output.readUInt32LE(40),sampleRate*8*2);
  assert.equal(output.length,44+sampleRate*8*2);
});

test('default FX shape is stable and render accepts fx without changing core synthesis',()=>{
  const fx=defaultFx();
  assert.deepEqual(fx,{pan:0,low:0,high:1,delay:0,reverb:0});
  const a=render({duration:4,seed:7});
  const b=render({duration:4,seed:7,fx:[{...fx,pan:.5,delay:.3,reverb:.4}]});
  assert.deepEqual(a.mix,b.mix);
});

test('drum pattern is editable data and drives drum rendering',()=>{
  const settings={duration:8,seed:11,prompt:'lofi beat',style:'Lo-fi'};
  const a=render(settings);
  const dp=defaultDrumPattern(settings);
  assert.deepEqual(a.pattern.drums,dp.drums);
  assert.ok(dp.drums.kick.length>0 && dp.drums.kick.length===dp.drums.snare.length && dp.drums.hat.length===dp.drums.kick.length);

  const cleared={kick:dp.drums.kick.map(()=>0),snare:dp.drums.snare.map(()=>0),hat:dp.drums.hat.map(()=>0)};
  const b=render({...settings,pattern:{version:1,stepsPerBeat:4,drums:cleared}});
  assert.ok(b.stems[0].every(v=>Math.abs(v)<1e-9));
  // other stems unaffected by drum pattern
  for(let i=0;i<a.stems[1].length;i+=97){
    assert.ok(Math.abs(a.stems[1][i]-b.stems[1][i])<1e-6);
    assert.ok(Math.abs(a.stems[2][i]-b.stems[2][i])<1e-6);
    assert.ok(Math.abs(a.stems[3][i]-b.stems[3][i])<1e-6);
  }
  const c=render({...settings,pattern:{version:1,stepsPerBeat:4,drums:{...cleared,kick:cleared.kick.map((_,i)=>i===0?1:0)}}});
  assert.ok(c.stems[0].some(v=>Math.abs(v)>0.01));
});
