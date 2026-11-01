import test from 'node:test';
import assert from 'node:assert/strict';
import { createTapCounter } from '../src/tests/tap-test.js';
import { createTapPanel } from '../src/tests/tap-panel.js';
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

test('tapping speed includes idle time, not just inter-tap intervals', () => {
  const c=createTapCounter();
  for (const t of [100,200,300]) {c.update(world(.5),t-10);c.update(world(.1),t);}
  assert.equal(c.result(10000).tapsPerSec,.3);
});
test('initial contact and threshold jitter do not create extra taps',()=>{
 const c=createTapCounter();c.update(world(.1),0);c.update(world(.2),20);assert.equal(c.result(1000).taps,0);
 c.update(world(.5),30);c.update(world(.1),40);c.update(world(.2),50);c.update(world(.1),60);assert.equal(c.result(1000).taps,1);
});
test('zero-sized hand does not enter trace',()=>{const c=createTapCounter();const w=world(.1);w[9].x=0;assert.equal(c.update(w,0),null);assert.equal(c.result(1000).trace.length,0);});
test('color recovery uses 30 elapsed seconds and a trailing 10-second window',()=>{const r=computeRecovery(rows(),events,1);assert.equal(r.ok,true);assert.equal(r.recoverySec,28);});
test('a gap cannot be reported as sustained recovery',()=>{const r=computeRecovery(rows().filter(r=>Number(r.t)<25||Number(r.t)>55),events,1);assert.equal(r.ok,false);assert.match(r.reason,/gaps/);});
test('many rapid samples are not sixty seconds',()=>assert.equal(computeRecovery(rows(20,.1),events,1).ok,false));
test('warming without initial tracking is rejected',()=>assert.equal(computeRecovery(rows().filter(r=>Number(r.t)>10),events,1).ok,false));
test('hidden-page interruption is rejected',()=>assert.equal(computeRecovery(rows(),[...events,{type:'interrupted'}],1).ok,false));
test('no initial change is not a zero-second recovery',()=>{const r=computeRecovery(rows().map(r=>({...r,change_score:'0'})),events,1);assert.equal(r.noChange,true);assert.equal(r.recoverySec,null);});
test('unrecovered session is distinct from invalid recording',()=>{const r=computeRecovery(rows().map(r=>({...r,change_score:'10'})),events,1);assert.equal(r.ok,true);assert.equal(r.recoverySec,null);});
test('history safely ignores non-arrays and malformed records',()=>{globalThis.localStorage=storage();localStorage.setItem('finger-color-history','{}');assert.deepEqual(loadHistory(),[]);localStorage.setItem('finger-color-history',JSON.stringify([{test:'<img>',result:1,savedAt:'2026-10-31'},null]));assert.deepEqual(loadHistory(),[]);assert.equal(saveSession({test:'tapping',result:3}),true);assert.equal(loadHistory().length,1);});
test('storage failure is returned to the UI',()=>{globalThis.localStorage={getItem:()=>null,setItem:()=>{throw Error('blocked')}};assert.equal(saveSession({test:'color',result:1}),false);});
test('CSV quotes commas, quotes, and multiline fields',()=>assert.equal(toCSV([{name:'a,b',note:'a"b\nc'}]),'name,note\n"a,b","a""b\nc"'));
test('black grey-card sample cannot create Infinity',()=>assert.equal(correctWithCard({r:100,g:100,b:100},{r:0,g:0,b:0}),null));
test('sRGB conversion preserves black, D65 white and primary red',()=>{const b=linearToLab(toLinear({r:0,g:0,b:0}));const w=linearToLab(toLinear({r:255,g:255,b:255}));const r=linearToLab(toLinear({r:255,g:0,b:0}));assert.equal(b.L,0);assert.ok(Math.abs(w.L-100)<.01);assert.ok(Math.abs(r.L-53.24)<.02);assert.ok(Math.abs(r.a-80.09)<.02);});
test('sampling outside the canvas returns null',()=>assert.equal(averageRGB({canvas:{width:100,height:100}},150,150,10),null));
test('camera tracks stop if video playback fails',async()=>{let stopped=false;Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>stopped=true}]})}}});const video={play:async()=>{throw Error('blocked')}};await assert.rejects(startCamera(video));assert.equal(stopped,true);assert.equal(video.srcObject,null);});
test('cycle hysteresis ignores jitter and counts a full bend/open',()=>assert.equal(countCycles([170,119,125,118,130,151,149,151]),1));
test('catch detector identifies a sustained pause followed by a snap',()=>{const samples=Array.from({length:12},(_,i)=>({t:i*30,angle:i<10?120:160}));assert.equal(findCatches(samples).length,1);});

function panelHarness() {
 globalThis.localStorage=storage();
 const elements=new Map();
 globalThis.document={getElementById(id){if(!elements.has(id))elements.set(id,{textContent:'',disabled:false,style:{},classList:{toggle(){},add(){},remove(){}}});return elements.get(id);}};
 let busy=false;
 const panel=createTapPanel({setStatus(){},setBusy:v=>busy=v,onSaved(){},fileName:()=>''});
 const ctx={canvas:{width:100,height:100},beginPath(){},arc(){},fill(){},moveTo(){},lineTo(){},stroke(){}};
 return {panel,elements,ctx,busy:()=>busy};
}
test('tapping panel waits for a visible hand before countdown',()=>{const h=panelHarness();h.elements.get('tap-start').onclick();h.panel.onFrame(null,performance.now()+5000,h.ctx);assert.match(h.elements.get('tap-live').textContent,/Show both fingertips/);assert.equal(h.busy(),true);h.panel.cancel();assert.equal(h.busy(),false);});
function calibratedSession(h) {
 h.elements.get('tap-start').onclick();const t=performance.now();
 const frame=(gap,ms)=>h.panel.onFrame({image:world(gap),world:world(gap)},t+ms,h.ctx);
 for(let ms=0;ms<=1500;ms+=30)frame(.24,ms);
 for(let ms=1530;ms<=3060;ms+=30)frame(.8,ms);
 frame(.8,6060);return t+6060;
}
test('a whole test with tracking loss is not saved as zero',()=>{const h=panelHarness();const t=calibratedSession(h);h.panel.tick(t+10001);assert.match(h.elements.get('tap-result').textContent,/Tracking was incomplete/);assert.equal(loadHistory().length,0);assert.equal(h.elements.get('tap-pdf').disabled,false);});
test('calibrated synthetic tap session saves full-window speed and excludes late frames',()=>{
 const h=panelHarness();const t=calibratedSession(h);
 for(let ms=30;ms<10000;ms+=30){const w=world(ms%600<300?.8:.24);h.panel.onFrame({image:w,world:w},t+ms,h.ctx);}
 const late=world(.24);h.panel.onFrame({image:late,world:late},t+15000,h.ctx);
 const saved=loadHistory();assert.equal(saved.length,1);assert.ok(saved[0].taps>0);assert.equal(saved[0].result,saved[0].taps/10);assert.equal(h.busy(),false);
});

test('single-frame angle spike does not become a catch',()=>{const s=Array.from({length:20},(_,i)=>({t:i*33,angle:i===12?160:120}));assert.equal(findCatches(s).length,0);});
test('missing angle frames cannot supply a pause-and-release',()=>{const s=[...Array.from({length:10},(_,i)=>({t:i*30,angle:120})),{t:800,angle:160},{t:830,angle:160}];assert.equal(findCatches(s).length,0);});
