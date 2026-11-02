import {setObservation} from '../features.js';
import {researchContext, repeatSummary} from '../research.js';
import { createTapCounter, measureGap, calibrateTap, MAX_RELIABLE_TAPS_PER_SEC } from './tap-test.js';
import { drawDot } from '../draw.js';
import { downloadRows } from '../recorder.js';
import { saveSession, loadHistory } from '../history.js';
import { currentGuidance, currentProfile } from '../guidance.js';
const TEST_MS=10000, CAL_MS=1500;
export function createTapPanel({setStatus,setBusy,onSaved,fileName}) {
 const $=id=>document.getElementById(id);
 const btnStart=$('tap-start'),btnCsv=$('tap-csv'),btnPdf=$('tap-pdf'),live=$('tap-live'),meter=$('tap-meter-fill'),result=$('tap-result');
 let phase='idle',tStart=0,phaseStart=null,counter=null,last=null,closed=[],opened=[],calibration=null,trackedMs=0,previous=null,previousGood=false,maxGap=0,lastTracked=0,name='',date='',context={};
 btnStart.onclick=()=>phase==='idle'?start():cancel();
 btnCsv.onclick=()=>last&&downloadRows(last.trace.map(r=>({t_ms:r.t.toFixed(0),gap:r.gap.toFixed(3),tap:last.tapTimes.includes(r.t)?1:0})),name+'_gap.csv');
 btnPdf.onclick=async()=>{
  if(!last)return;btnPdf.disabled=true;
  try {const {makeMovementReport}=await import('../movement-report.js');makeMovementReport({test:'tapping',name,date,status:last.valid?'Usable recording':'Not scored',metrics:[['Detected taps',last.valid?last.taps:'Not scored'],['Average speed',last.valid?last.tapsPerSec.toFixed(2)+' taps/s':'Not scored'],['First detected tap',last.tapTimes.length?(last.tapTimes[0]/1000).toFixed(2)+' s':'None'],['Last detected tap',last.tapTimes.length?(last.tapTimes.at(-1)/1000).toFixed(2)+' s':'None'],['Intervals used',Math.max(0,last.taps-1)],['Average interval',last.valid&&last.averageIntervalMs!==null?last.averageIntervalMs.toFixed(0)+' ms':'Not available'],['Rhythm variation',last.valid&&last.rhythmCV!==null?last.rhythmCV.toFixed(1)+'%':'Not available'],['Tracked time',(last.coverage*100).toFixed(1)+'%'],['Tracked samples',last.trace.length],['Largest tracking gap',last.maxGap.toFixed(0)+' ms']],explanation:last.explanation,guidance:currentGuidance('tapping'),research:researchContext('tapping',context,last),repeat:repeatSummary(loadHistory(),context),measurementContext:context,series:last.trace.map(r=>({t:r.t/1000,v:r.gap})),seriesLabel:'Thumb-index gap (hand lengths)',tapTimes:last.tapTimes.map(t=>t/1000),thresholds:last.thresholds,events:[]});}
  catch(e){setStatus('PDF could not be created. Try again: '+e.message);}finally{btnPdf.disabled=false;}
 };
 function start(){setObservation('tapping',null);context=Object.fromEntries(Object.entries(currentProfile('tapping')).filter(([key])=>['age','sex','hand','dominant','setup'].includes(key)));phase='closed';tStart=performance.now();phaseStart=null;closed=[];opened=[];calibration=null;last=null;trackedMs=0;previous=null;previousGood=false;maxGap=0;lastTracked=0;name=fileName('tapping');date=new Date().toLocaleString();btnCsv.disabled=btnPdf.disabled=true;btnStart.textContent='Cancel setup / test';setBusy(true);result.textContent='First, teach the camera what touching and open look like for your hand.';setStatus('Setup 1/2: gently touch thumb and index together and hold.');}
 function cancel(){if(phase==='idle')return;phase='idle';setBusy(false);btnStart.textContent='Set up & start test';result.textContent='Test cancelled. No score saved.';}
 function finish(){phase='idle';setBusy(false);btnStart.textContent='Set up & start test';last=counter.result(TEST_MS);last.coverage=trackedMs/TEST_MS;maxGap=Math.max(maxGap,TEST_MS-lastTracked);last.maxGap=maxGap;last.valid=last.coverage>=.9&&maxGap<=500&&last.trace.length>=150;btnCsv.disabled=!last.trace.length;btnPdf.disabled=false;
  setObservation('tapping',{valid:last.valid,summary:last.valid?`${last.taps} detected taps in 10 seconds; ${last.tapsPerSec.toFixed(2)} taps/s. This measures dexterity, not nerve compression.`:'Tracking checks failed. No interpretable movement score.'});
  if(!last.valid){last.explanation=`Repeat needed: ${(last.coverage*100).toFixed(0)}% tracked time, ${last.trace.length} samples, longest gap ${maxGap.toFixed(0)} ms. A score needs 90% tracking, 150 samples and no gap above 500 ms. Keep both fingertips visible, use steady light and close other camera apps. No score was saved.`;result.textContent=last.explanation;setStatus('Please repeat: tracking quality was insufficient.');return;}
  last.explanation=`Average speed = ${last.taps} detected taps / 10 seconds = ${last.tapsPerSec.toFixed(2)} taps/s. Average interval is the mean time between successive detected taps. Rhythm variation = sample standard deviation / mean interval x 100. It is not disease severity. Mean intervals exclude the wait before the first tap and after the last tap; overall speed includes the entire 10 seconds. Missed detections can affect both.`;
  if(last.taps===0)last.explanation+=' No calibrated open-to-touch movements were detected. This does not mean your hand cannot tap: check the live meter and recalibrate with both tips visible.';
  if(last.tapsPerSec>MAX_RELIABLE_TAPS_PER_SEC)last.explanation+=' Fast movements may fall between camera frames and be missed.';
  result.className='result';result.innerHTML=`<p class="quality-pill">Recording checks passed · not a health grade</p><div class="result-label">Detected taps in 10 seconds</div><div class="result-big">${last.taps}</div><div class="stat-row"><div><span>Average speed</span><strong>${last.tapsPerSec.toFixed(1)} taps/s</strong></div><div><span>Rhythm variation</span><strong>${last.rhythmCV===null?'Not enough taps':last.rhythmCV.toFixed(0)+'%'}</strong></div></div><p class="result-note">${last.explanation}</p><p class="result-note">Tracking coverage: ${(last.coverage*100).toFixed(1)}%. This is recording quality, not diagnostic accuracy.</p>`;
  const saved=last.taps>0?saveSession({test:'tapping',algorithm:3,result:last.tapsPerSec,taps:last.taps,context}):true;const research=researchContext('tapping',context,last);const comparison=document.createElement('p');comparison.className='result-note';comparison.textContent=research.lines.join(' ')+' '+repeatSummary(loadHistory(),context).lines.join(' ');result.append(comparison);onSaved();setStatus(saved?'Finished. Read the explanation and export your PDF.':'Finished. Storage unavailable; download your PDF.');
 }
 function onFrame(hand,now,ctx){const gap=measureGap(hand?.world);if(hand){drawDot(ctx,hand.image[4],'#265dd9',9);drawDot(ctx,hand.image[8],'#265dd9',9);}
  if(gap!==null){const max=calibration?.opened||1;meter.style.width=Math.min(100,gap/max*100)+'%';}
  if(phase==='idle'){live.textContent=gap===null?'Show thumb AND index to the camera.':'Hand found. Setup will learn your touching and open positions.';return;}
  if(phase==='closed'||phase==='open'){
   if(gap===null){phaseStart=null;if(phase==='closed')closed=[];else opened=[];live.textContent='Hand lost. Show both fingertips; this setup step restarts.';return;}
   if(phase==='open' && gap < closed.slice().sort((a,b)=>a-b)[Math.floor(closed.length/2)]+.12){phaseStart=null;opened=[];live.textContent='2/2: Now separate thumb and index widely, then hold.';return;}
   if(phaseStart===null)phaseStart=now;
   const list=phase==='closed'?closed:opened;list.push(gap);
   live.textContent=phase==='closed'?'1/2: Touch thumb and index gently. Hold still.':'2/2: Keep thumb and index wide apart. Hold still.';
   if(now-phaseStart>=CAL_MS&&list.length>=15){if(phase==='closed'){phase='open';phaseStart=null;setStatus('Now open thumb and index wide, and hold.');}else{calibration=calibrateTap(closed,opened);if(!calibration.ok){cancel();result.textContent=calibration.reason;setStatus(calibration.reason);return;}counter=createTapCounter(calibration);phase='ready';tStart=now;setStatus('Setup complete. Keep fingers apart for the countdown.');}}return;
  }
  if(phase==='ready'){if(gap===null||gap<calibration.open){tStart=now;live.textContent='Hold fingers apart in view to begin the 3-second countdown.';return;}live.textContent='Starting in '+Math.max(0,Math.ceil((3000-(now-tStart))/1000));if(now-tStart>=3000){phase='testing';tStart=now;result.textContent='Tap thumb and index together, then open. Repeat comfortably for 10 seconds.';}return;}
  const elapsed=now-tStart;if(elapsed>=TEST_MS){finish();return;}
  const r=gap===null?null:counter.update(hand.world,elapsed);
  if(previous!==null&&previousGood&&r)trackedMs+=Math.min(elapsed-previous,100);previous=elapsed;previousGood=Boolean(r);
  if(r){maxGap=Math.max(maxGap,elapsed-lastTracked);lastTracked=elapsed;meter.classList.toggle('touching',r.touching);live.textContent=`${r.taps} taps · ${((TEST_MS-elapsed)/1000).toFixed(1)} s left · ${r.touching?'Touch detected':'Open, then touch'}`;}else live.textContent='Hand not tracked. Keep both fingertips visible.';
 }
 return {enable(){btnStart.disabled=false;},disable(){btnStart.disabled=true;live.textContent='Start the camera first.';},cancel,isRunning:()=>phase!=='idle',onFrame,tick(now){if(phase==='testing'&&now-tStart>=TEST_MS)finish();else if((phase==='closed'||phase==='open')&&now-tStart>30000){cancel();result.textContent='Setup timed out. Show both fingertips and try again.';}}};
}
