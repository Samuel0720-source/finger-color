// Evidence vocabulary is intentionally separate from the consultation decision.
export const RULE_VERSION = 'feature-guidance-3 (2026-11-02)';
export const SOURCES = {
 color:'https://www.niams.nih.gov/health-topics/raynauds-phenomenon',
 catching:'https://orthoinfo.aaos.org/en/diseases--conditions/trigger-finger/',
 tapping:'https://orthoinfo.aaos.org/en/diseases--conditions/carpal-tunnel-syndrome/'
};
export const EXTRA = {
 color:[['trigger','What usually triggers the color change?',['Cold','Stress','Cold and stress','Other / no clear trigger','No color changes','Unsure']],['white','Have you noticed white / unusually pale fingers?',['No','Yes','Unsure']],['blue','Have you noticed blue fingers?',['No','Yes','Unsure']],['red','Have you noticed redness as your fingers warm?',['No','Yes','Unsure']],['rewarm','Do symptoms improve with gentle warming?',['No','Yes','Unsure','No symptoms']],['sores','Do you have fingertip sores or ulcers?',['No','Yes','Unsure']]],
 catching:[['basePain','Is there pain at the base of the affected finger on the palm side?',['No','Yes','Unsure']],['lockedNow','Is a finger stuck bent and unable to straighten now?',['No','Yes','Unsure']]],
 tapping:[['distribution','Where is the tingling or numbness?',['Thumb, index or middle (with or without ring finger)','Little finger only','Other / whole hand','No tingling or numbness','Unsure']],['constantNumb','Is the numbness now constant?',['No','Yes','Unsure']],['dropping','Are you repeatedly dropping objects unexpectedly?',['No','Yes','Unsure']]]
};
export function featureEvidence(mode,a={},observation=null){
 const rows=[];const add=(feature,status,detail)=>rows.push({feature,status,detail});
 const report=(key,label)=>add(label,!a[key]||a[key]==='Unsure'?'Unknown':'User reported',a[key]||'Not answered');
 if(mode==='color'){
  for(const [key,label] of [['trigger','Trigger'],['white','Pale / white phase'],['blue','Blue phase'],['red','Redness with warming'],['rewarm','Improvement with warming']])report(key,label);
  add('Sharp color boundaries and two-hand symmetry','Not assessed','Not detected by the current camera method. All three colors and multiple affected fingers are not required.');
  add('Temperature comparison','Not validated','Optional temperature entries are personal logs, not a validation study. Camera color recovery is not blood-flow or temperature recovery.');
 }else if(mode==='catching'){
  for(const [key,label] of [['symptom0','Locking / sticking'],['basePain','Palm-side finger-base pain'],['symptom2','Morning stiffness'],['symptom3','Assistance to release']])report(key,label);
  add('Tendon examination','Not assessed','The camera cannot palpate tenderness or confirm tendon catching. Thumb catching is not measured.');
 }else{
  for(const [key,label] of [['distribution','Numbness / tingling distribution'],['symptom2','Night symptoms'],['symptom3','Thumb / grip difficulty'],['constantNumb','Constant numbness']])report(key,label);
  add('Median nerve compression','Not assessed','Tapping measures movement performance. Neither fast nor slow tapping establishes or excludes carpal tunnel syndrome.');
 }
 add('Camera observation',!observation?'Not assessed':observation.valid?'Camera observed':'Not scored',observation?.summary||'No completed measurement is attached.');
 let interpretation='The available answers do not establish a characteristic pattern. Missing or negative features do not rule out a condition.';
 if(mode==='color' && (a.symptom0==='Yes'||['Cold','Stress','Cold and stress'].includes(a.trigger)) && (a.white==='Yes'||a.blue==='Yes'))interpretation='Reported cold- or stress-related pale/blue color changes are compatible with Raynaud-type episodes. Clinical assessment is needed to establish the cause; camera recovery is supporting observation only.';
 if(mode==='catching' && a.symptom0==='Yes' && (a.basePain==='Yes'||a.symptom1==='Yes'))interpretation='Reported locking together with painful clicking or finger-base pain is compatible with trigger finger. Video angle flags cannot confirm that the tendon caught.';
 if(mode==='tapping' && a.distribution==='Thumb, index or middle (with or without ring finger)' && a.symptom2==='Yes')interpretation='Reported numbness/tingling in this finger distribution together with night symptoms is compatible with carpal tunnel syndrome. Other causes remain possible; tapping does not test the median nerve.';
 return {rows,interpretation,source:SOURCES[mode],version:RULE_VERSION};
}
const observations={};
export function setObservation(mode,value){observations[mode]=value; if(typeof document!=='undefined'&&document.dispatchEvent)document.dispatchEvent(new Event('observation-change'));}
export function getObservation(mode){return observations[mode]||null;}

const fingers=['Thumb','Index','Middle','Ring','Little'];
const symptoms=['Pain','Numbness / tingling','Locking','Color change'];
export function mountSymptomMap(host,onChange){
 const state={};let selected='Right Index';
 host.innerHTML=`<h4>Where do symptoms happen? (optional)</h4><p class="hint small">Select a finger, then mark symptoms. Unmarked areas are unknown, not symptom-free. This map describes symptoms, independently of the measured hand.</p><div class="hand-maps">${['Left','Right'].map(hand=>`<div><strong>${hand} hand</strong><div class="hand-shape">${fingers.map((f,i)=>`<button type="button" data-location="${hand} ${f}" class="finger-location finger-${i}" aria-pressed="false">${f}</button>`).join('')}<span class="palm-shape" aria-hidden="true"></span></div></div>`).join('')}</div><p class="selected-location"></p><div class="map-options">${symptoms.map((s,i)=>`<label><input type="checkbox" data-symptom="${i}"> ${s}</label>`).join('')}<label>Surface<select class="map-surface"><option>Not specified</option><option>Palm side</option><option>Back of hand</option><option>Both surfaces</option></select></label></div><button type="button" class="map-clear btn btn-secondary">Clear this finger</button><p class="map-summary hint small"></p>`;
 const sync=()=>{host.querySelector('.selected-location').textContent=selected;host.querySelectorAll('[data-location]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.location===selected));b.classList.toggle('has-symptoms',!!state[b.dataset.location]?.symptoms.length);});host.querySelectorAll('[data-symptom]').forEach(c=>c.checked=state[selected]?.symptoms.includes(symptoms[Number(c.dataset.symptom)])||false);host.querySelector('.map-surface').value=state[selected]?.surface||'Not specified';host.querySelector('.map-summary').textContent=summary();};
 const summary=()=>Object.entries(state).filter(([,v])=>v.symptoms.length).map(([k,v])=>`${k} (${v.surface}): ${v.symptoms.join(', ')}`).join('; ')||'No locations recorded.';
 host.querySelectorAll('[data-location]').forEach(b=>b.onclick=()=>{selected=b.dataset.location;sync();});
 host.querySelectorAll('input,select').forEach(c=>c.onchange=()=>{state[selected]={symptoms:[...host.querySelectorAll('[data-symptom]:checked')].map(c=>symptoms[Number(c.dataset.symptom)]),surface:host.querySelector('.map-surface').value};sync();onChange();});
 host.querySelector('.map-clear').onclick=()=>{delete state[selected];sync();onChange();};sync();return summary;
}
