import test from 'node:test';
import assert from 'node:assert/strict';
import { createReachCounter } from '../src/tests/reach-panel.js';
import { computeRecovery } from '../src/recovery.js';
import { loadHistory, saveSession } from '../src/history.js';
import { toCSV } from '../src/recorder.js';
import { correctWithCard, toLinear, linearToLab, averageRGB } from '../src/color.js';
import { startCamera } from '../src/camera.js';
import { findCatches, countCycles } from '../src/tests/trigger-test.js';

const world = gap => {
  const w = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  w[9].x = 1; w[8].x = gap;
  return w;
};
const rows = (duration=100, step=1) => Array.from({ length: Math.floor(duration/step)+1 }, (_, i) => ({finger:'middle', t:String(i*step), change_score: i*step < 20 ? '10' : '0'}));
const events = [{type:'warm_start',t:0}];
const storage = () => {let data={};return { getItem:k=>data[k]??null, setItem:(k,v)=>{data[k]=v;} };};

test('color recovery uses 30 elapsed seconds and a trailing 10-second window',()=>{const r=computeRecovery(rows(),events,1);assert.equal(r.ok,true);assert.equal(r.recoverySec,28);});
test('a gap cannot be reported as sustained recovery',()=>{const r=computeRecovery(rows().filter(r=>Number(r.t)<25||Number(r.t)>55),events,1);assert.equal(r.ok,false);assert.match(r.reason,/gaps/);});
test('many rapid samples are not sixty seconds',()=>assert.equal(computeRecovery(rows(20,.1),events,1).ok,false));
test('warming without initial tracking is rejected',()=>assert.equal(computeRecovery(rows().filter(r=>Number(r.t)>10),events,1).ok,false));
test('hidden-page interruption is rejected',()=>assert.equal(computeRecovery(rows(),[...events,{type:'interrupted'}],1).ok,false));
test('no initial change is not a zero-second recovery',()=>{const r=computeRecovery(rows().map(r=>({...r,change_score:'0'})),events,1);assert.equal(r.noChange,true);assert.equal(r.recoverySec,null);});
test('unrecovered session is distinct from invalid recording',()=>{const r=computeRecovery(rows().map(r=>({...r,change_score:'10'})),events,1);assert.equal(r.ok,true);assert.equal(r.recoverySec,null);});
test('history safely ignores non-arrays and malformed records',()=>{globalThis.localStorage=storage();localStorage.setItem('finger-color-history','{}');assert.deepEqual(loadHistory(),[]);localStorage.setItem('finger-color-history',JSON.stringify([{test:'<img>',result:1,savedAt:'2026-10-31'},null]));assert.deepEqual(loadHistory(),[]);assert.equal(saveSession({test:'color',result:3}),true);assert.equal(loadHistory().length,1);});
test('storage failure is returned to the UI',()=>{globalThis.localStorage={getItem:()=>null,setItem:()=>{throw Error('blocked')}};assert.equal(saveSession({test:'color',result:1}),false);});
test('CSV quotes commas, quotes, and multiline fields',()=>assert.equal(toCSV([{name:'a,b',note:'a"b\nc'}]),'name,note\n"a,b","a""b\nc"'));
test('black grey-card sample cannot create Infinity',()=>assert.equal(correctWithCard({r:100,g:100,b:100},{r:0,g:0,b:0}),null));
test('sRGB conversion preserves black, D65 white and primary red',()=>{const b=linearToLab(toLinear({r:0,g:0,b:0}));const w=linearToLab(toLinear({r:255,g:255,b:255}));const r=linearToLab(toLinear({r:255,g:0,b:0}));assert.equal(b.L,0);assert.ok(Math.abs(w.L-100)<.01);assert.ok(Math.abs(r.L-53.24)<.02);assert.ok(Math.abs(r.a-80.09)<.02);});
test('sampling outside the canvas returns null',()=>assert.equal(averageRGB({canvas:{width:100,height:100}},150,150,10),null));
test('camera tracks stop if video playback fails',async()=>{let stopped=false;Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>stopped=true}]})}}});const video={play:async()=>{throw Error('blocked')}};await assert.rejects(startCamera(video));assert.equal(stopped,true);assert.equal(video.srcObject,null);});
test('cycle hysteresis ignores jitter and counts a full bend/open',()=>assert.equal(countCycles([170,119,125,118,130,151,149,151]),1));
test('catch detector identifies a sustained pause followed by a snap',()=>{const samples=Array.from({length:12},(_,i)=>({t:i*30,angle:i<10?120:160}));assert.equal(findCatches(samples).length,1);});

test('single-frame angle spike does not become a catch',()=>{const s=Array.from({length:20},(_,i)=>({t:i*33,angle:i===12?160:120}));assert.equal(findCatches(s).length,0);});
test('missing angle frames cannot supply a pause-and-release',()=>{const s=[...Array.from({length:10},(_,i)=>({t:i*30,angle:120})),{t:800,angle:160},{t:830,angle:160}];assert.equal(findCatches(s).length,0);});

const reachWorld=(target,gap)=>{const w=Array.from({length:21},()=>({x:0,y:0,z:0}));w[9]={x:0,y:1,z:0};w[4]={x:5,y:5,z:0};w[target]={x:5+gap,y:5,z:0};return w;};
test('thumb reach needs two touching frames in a row and goes finger by finger',()=>{const c=createReachCounter();c.update(reachWorld(8,.1));assert.equal(c.target,'index');c.update(reachWorld(8,.1));assert.equal(c.target,'middle');c.update(reachWorld(12,.1));c.update(reachWorld(12,.5));c.update(reachWorld(12,.1));assert.equal(c.target,'middle');});
test('thumb reach records unreached fingertips after skipping',()=>{const c=createReachCounter();for(const idx of [8,12,16]){c.update(reachWorld(idx,.1));c.update(reachWorld(idx,.1));}c.update(reachWorld(20,.6));c.skip();const r=c.result();assert.deepEqual(r.reached,{index:true,middle:true,ring:true,pinky:false});assert.ok(r.minGap.pinky>.5);});
