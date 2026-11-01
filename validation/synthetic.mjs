// Development scenarios, not clinical validation or camera/landmark evaluation.
import {writeFileSync} from 'node:fs';
import {createTapCounter,calibrateTap} from '../src/tests/tap-test.js';
import {summarizeFinger} from '../src/tests/trigger-test.js';
import {computeRecovery} from '../src/recovery.js';
const world=gap=>{const w=Array.from({length:21},()=>({x:0,y:0,z:0}));w[9].x=1;w[8].x=gap;return w;};
let seed=20261101;const noise=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296-.5;};
const cases=[];
for(let i=0;i<20;i++){
 const fps=[15,30,60,30][i%4],rate=[1,2,3,5,8][i%5],closed=[.08,.24,.38][i%3],opened=closed+.5;
 const calibration=calibrateTap(Array.from({length:45},()=>closed+noise()*.02),Array.from({length:45},()=>opened+noise()*.02));
 const revised=createTapCounter(calibration),old=createTapCounter();
 for(let t=0;t<10000;t+=1000/fps){const phase=(t*rate/1000)%1;const gap=closed+(opened-closed)*(1+Math.cos(2*Math.PI*phase))/2+noise()*.025;old.update(world(gap),t);revised.update(world(gap),t);}
 const expected=rate*10,observed=revised.result(10000).taps;
 cases.push({id:`tap-${i+1}`,test:'tapping',fps,rate,closed,expected,observed,previous:old.result(10000).taps,absoluteError:Math.abs(observed-expected),percentError:100*Math.abs(observed-expected)/expected,stress:rate>6});
}
for(let i=0;i<20;i++){
 const fps=[15,30,60,30][i%4],kind=['smooth','pause-release','single-frame-spike','stationary'][Math.floor(i/5)],times=[],angles=[];
 const repeats=5;
 for(let t=0;t<repeats*2000;t+=1000/fps){const phase=t%2000;let a;
 if(kind==='smooth')a=135+40*Math.cos(2*Math.PI*phase/2000);
 if(kind==='pause-release')a=phase<500?175-(phase/500)*80:phase<900?95+(phase-500)/400*25:phase<1300?120:phase<1340?120+(phase-1300)/40*50:170;
 if(kind==='stationary')a=120;
 if(kind==='single-frame-spike')a=phase>=1000&&phase<1000+1000/fps?165:120;
 times.push(t);angles.push(a+noise()*2);
 }
 const expected=kind==='pause-release'?repeats:0,observed=summarizeFinger(times,angles).catches.length;
 cases.push({id:`catch-${i+1}`,test:'catching',fps,kind,expected,observed,absoluteError:Math.abs(observed-expected),percentError:expected?100*Math.abs(observed-expected)/expected:null});
}
for(let i=0;i<10;i++){
 const step=[.25,.5,1,2,.5][i%5],trueRecovery=15+i*2;
 const rows=Array.from({length:Math.floor(110/step)+1},(_,j)=>({finger:'middle',t:j*step,change_score:j*step<trueRecovery?10:0}));
 const r=computeRecovery(rows,[{type:'warm_start',t:0}],1);
 cases.push({id:`color-${i+1}`,test:'color',step,expected:trueRecovery,observed:r.recoverySec,absoluteError:Math.abs(r.recoverySec-trueRecovery),percentError:100*Math.abs(r.recoverySec-trueRecovery)/trueRecovery});
}
const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
const summary=Object.fromEntries(['tapping','catching','color'].map(test=>{const group=cases.filter(c=>c.test===test),positive=group.filter(c=>c.expected>0);return [test,{scenarios:group.length,exactMatches:group.filter(c=>c.expected===c.observed).length,meanAbsoluteError:avg(group.map(c=>c.absoluteError)),meanPercentErrorOnPositiveCases:avg(positive.map(c=>c.percentError)),falseFlagsOnZeroCases:group.filter(c=>c.expected===0).reduce((s,c)=>s+c.observed,0)}];}));
summary.tapping.previousMeanPercentError=avg(cases.filter(c=>c.test==='tapping').map(c=>100*Math.abs(c.previous-c.expected)/c.expected));
summary.tapping.withinClaimedRateMeanPercentError=avg(cases.filter(c=>c.test==='tapping'&&!c.stress).map(c=>c.percentError));
const output={seed:20261101,scope:'50 deterministic development signals; no real video, patients, diagnostic sensitivity or specificity. Color error includes intentional smoothing latency against a physical step return.',summary,cases};
writeFileSync(new URL('synthetic-results.json',import.meta.url),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
