import test from 'node:test';
import assert from 'node:assert/strict';
import {featureEvidence,setObservation,getObservation} from '../src/features.js';
import {getGuidance} from '../src/guidance.js';
const negative={urgent:'No',symptom0:'No',symptom1:'No',symptom2:'No',symptom3:'No',duration:'No symptoms',trend:'No symptoms',impact:'No impact',sores:'No',lockedNow:'No',constantNumb:'No',dropping:'No'};
test('40 care scenarios keep positives, blanks and camera evidence distinct',()=>{
 for(let i=0;i<40;i++){
  const mode=['color','catching','tapping'][i%3];
  const a=i%4===0?{}:i%4===1?negative:i%4===2?{...negative,urgent:'Yes'}:{...negative,trend:'Worsening'};
  assert.equal(getGuidance(mode,a).code,['insufficient','no_indication','recommend','recommend'][i%4]);
  const e=featureEvidence(mode,a,{valid:false,summary:'Tracking failed'});
  assert.equal(e.rows.at(-1).status,'Not scored');
 }
});
test('Raynaud-compatible features need neither three phases nor multiple fingers',()=>{const e=featureEvidence('color',{trigger:'Cold',white:'Yes'});assert.match(e.interpretation,/compatible/);assert.match(e.rows.find(r=>r.feature==='Temperature comparison').detail,/not a validation study/);});
test('tapping never supplies median nerve evidence',()=>{for(const valid of [true,false]){const e=featureEvidence('tapping',{}, {valid,summary:'70 taps'});assert.doesNotMatch(e.interpretation,/compatible with carpal/);assert.equal(e.rows.find(r=>r.feature==='Median nerve compression').status,'Not assessed');}});
test('characteristic symptom combinations explain referral',()=>{const a={...negative,distribution:'Thumb, index or middle (with or without ring finger)',symptom2:'Yes',duration:'Less than 2 weeks',trend:'Improving'};const r=getGuidance('tapping',a);assert.equal(r.code,'recommend');assert.match(r.evidence.interpretation,/compatible with carpal/);});
test('new concerning answers override missing old answers',()=>{for(const [mode,a] of [['color',{sores:'Yes'}],['catching',{lockedNow:'Yes'}],['tapping',{constantNumb:'Yes'}]])assert.equal(getGuidance(mode,a).code,'recommend');});
test('positive map cannot coexist with symptom-free reassurance',()=>assert.equal(getGuidance('tapping',{...negative,symptomMap:'Right Index (Palm side): Numbness / tingling'}).code,'insufficient'));
test('unanswered additional safety question is not negative',()=>assert.equal(getGuidance('color',{...negative,sores:''}).code,'insufficient'));
test('new test clears old observation',()=>{setObservation('color',{valid:true,summary:'old'});setObservation('color',null);assert.equal(getObservation('color'),null);});
