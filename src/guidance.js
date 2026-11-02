import {EXTRA, featureEvidence, getObservation, mountSymptomMap} from './features.js';
const maps={};
import {sessionContext, PROFILE_FIELDS} from './session.js';
import {researchContext} from './research.js';
// Educational symptom guidance, never a classifier based on a camera score.
export const GUIDANCE = {
 color: {title:"Color changes and Raynaud's", symptom:'My fingers repeatedly change color with cold or stress, with pain, numbness or tingling.', detail:"Recurring cold- or stress-related color changes can occur with Raynaud's. A camera recovery time cannot diagnose it or identify its cause.", action:'Discuss recurring symptoms with a clinician, especially if worsening, affecting daily life, on one side only, or accompanied by joint pain, a rash or muscle weakness.', source:'https://www.nhs.uk/conditions/raynauds/'},
 catching: {title:'Catching and trigger finger', symptom:'I feel a finger locking, clicking, or hurting when I bend or straighten it.', detail:'Painful clicking or a finger sticking in a bent position can occur with trigger finger. A detected pause-and-release pattern may also be voluntary movement or tracking noise.', action:'Arrange a clinical assessment if locking or pain persists or interferes with daily activities. Do not force a painful or locked finger.', source:'https://www.nhs.uk/conditions/trigger-finger/'},
 tapping: {title:'Dexterity and carpal tunnel symptoms', symptom:'I have recurring tingling, numbness, hand pain, or thumb/grip weakness, often worse at night.', detail:'These symptoms can occur with carpal tunnel syndrome. Slow tapping alone cannot identify carpal tunnel or any other disease; fatigue, pain, technique and tracking can change the score.', action:'Arrange a clinical assessment if these symptoms persist or worsen. A fast or normal-looking tapping result does not rule out a nerve problem.', source:'https://www.nhs.uk/conditions/carpal-tunnel-syndrome/'}
};

export const QUESTIONS = {
 color: ['Do your fingers change color with cold or stress?', 'Do color changes come with pain, numbness or tingling?', 'Does this affect only one side?', 'Do you also have joint pain, rash or muscle weakness?'],
 catching: ['Does a finger lock or stick when bending or straightening?', 'Do you feel painful clicking or tenderness?', 'Is stiffness worse after waking?', 'Do you need your other hand to release a stuck finger?'],
 tapping: ['Do you have tingling or numbness in your hand?', 'Do you have hand pain?', 'Do symptoms wake you or worsen at night?', 'Do you notice thumb weakness or difficulty gripping?']
};
const common = [
 ['urgent','Do you currently have severe hand pain, inability to move or hold things, or an icy cold, pale or blue hand?', ['No','Yes','Unsure']],
 ['age','Age in years (optional)', Array.from({length:121},(_,i)=>String(i))],
 ['sex','Sex category for research context (optional)', ['Female','Male','Another category','Prefer not to say']],
 ['setup','Measurement setup label (keep the same for repeats)', ['Laptop / usual room','Phone / usual room','Other setup']],
 ['duration','How long have symptoms been present?', ['No symptoms','Less than 2 weeks','2 weeks or longer']],
 ['trend','How are symptoms changing?', ['No symptoms','Improving','Unchanged / persistent','Worsening']],
 ['impact','How do symptoms affect daily activities?', ['No impact','Some difficulty','Unable to do some usual activities']],
 ['hand','Which hand did you measure?', ['Left','Right']],
 ['dominant','Which is your dominant hand?', ['Left','Right','Both']],
 ['pain','Pain during this test (self-reported, not disease risk)', ['0 - none','1-3 - mild','4-6 - moderate','7-10 - severe']],
 ['fatigue','Were you tired during the test?', ['No','Yes','Unsure']]
];
export function questionnaire(mode) {
 return [...QUESTIONS[mode].map((q,i)=>['symptom'+i,q,['No','Yes','Unsure']]),...EXTRA[mode],...common];
}
export function getGuidance(mode,answers={}) {
 if(!answers || typeof answers !== 'object') answers={};
 const mapText=answers.symptomMap;
 const g=GUIDANCE[mode], qs=questionnaire(mode);
 const rows=qs.map(([id,q,options])=>({question:q,answer:options.includes(answers[id])?answers[id]:'Not answered'}));
 answers=Object.fromEntries(qs.map(([id,q,options])=>[id,options.includes(answers[id])?answers[id]:'']));
 const yes=QUESTIONS[mode].map((_,i)=>answers['symptom'+i]==='Yes');
 const extraReported=EXTRA[mode].some(([id])=>answers[id]==='Yes')||['Cold','Stress','Cold and stress'].includes(answers.trigger)||['Thumb, index or middle (with or without ring finger)','Little finger only','Other / whole hand'].includes(answers.distribution);
 const mapReported=!!mapText&&mapText!=='No locations recorded.';
 const reported=yes.some(Boolean)||extraReported||mapReported;
 const reasons=[];
 if(mode==='color' && yes[0]) reasons.push('Recurring cold- or stress-related color changes merit discussion with a clinician; a camera cannot establish their cause');
 if(mode==='catching' && yes[0] && (yes[1]||answers.basePain==='Yes')) reasons.push('Locking together with pain is a reason for clinical assessment');
 if(mode==='tapping' && answers.distribution==='Thumb, index or middle (with or without ring finger)' && yes[2]) reasons.push('Numbness or tingling in the thumb/index/middle distribution with night symptoms warrants clinical assessment');
 if(answers.trend==='Worsening') reasons.push('Symptoms reported as worsening');
 if(answers.trend==='Unchanged / persistent') reasons.push('Symptoms reported as persistent');
 if(['Some difficulty','Unable to do some usual activities'].includes(answers.impact)) reasons.push('Daily activities affected');
 if(mode==='color'&&(yes[2]||yes[3])) reasons.push('One-sided changes or associated symptoms reported');
 if(answers.pain==='7-10 - severe') reasons.push('Severe pain reported');
 if(answers.urgent==='Yes') reasons.push('A symptom needing urgent medical advice was reported');
 if(reported && answers.duration==='2 weeks or longer') reasons.push('Symptoms have continued for at least two weeks');
 if(mode==='color'&&answers.sores==='Yes') reasons.push('Fingertip sores reported: prompt clinical assessment is needed');
 if(mode==='catching'&&(answers.lockedNow==='Yes'||yes[3])) reasons.push('A finger is stuck or needs assistance to release; do not force it');
 if(mode==='tapping'&&(answers.constantNumb==='Yes'||answers.dropping==='Yes'||yes[3])) reasons.push('Constant numbness or functional weakness reported');
 const urgent=answers.urgent==='Yes'||answers.pain==='7-10 - severe';
 const core=[...(mode==='color'?['sores']:mode==='catching'?['lockedNow']:['constantNumb','dropping']),'urgent','symptom0','symptom1','symptom2','symptom3','duration','trend','impact'];
 const missing=core.filter(id=>!answers[id]||answers[id]==='Unsure');
 const contradiction=(reported&&(answers.duration==='No symptoms'||answers.trend==='No symptoms'))||(!reported&&['symptom0','symptom1','symptom2','symptom3'].every(id=>answers[id]==='No')&&['Unchanged / persistent','Worsening'].includes(answers.trend));
 const code=reasons.length?'recommend':missing.length||contradiction?'insufficient':'no_indication';
 const conclusion={recommend:'Consultation recommended',no_indication:'No clear consultation indication in these answers',insufficient:'Insufficient information'}[code];
 const action=urgent?'Stop the test and seek urgent medical advice today. Do not wait for a camera result. Use your local urgent care service; call emergency services for an emergency.':code==='recommend'?'Arrange a clinical assessment and bring this record. Symptoms guide this recommendation even when camera data are unavailable.':code==='no_indication'?'Your completed answers did not trigger the configured consultation criteria. This is not a health clearance; seek advice if symptoms persist, worsen or concern you.':'Answer the symptom, duration, trend and daily activity questions above. Unanswered questions cannot establish that symptoms are absent.';
 const reasonText=reasons.length?reasons.join('; '):contradiction?'Some symptom answers conflict; please review them.':missing.length?`${missing.length} of ${core.length} symptom and impact answers still need a response. Answer the questions above to receive a consultation suggestion.`:'No reported persistence, worsening, daily limitation, severe test pain or configured condition-specific concern.';
 const research=researchContext(mode,answers);
 const evidence=featureEvidence(mode,answers);
 if(mapText)rows.push({question:'Symptom locations (user reported)',answer:mapText});
 return {evidence,title:g.title,urgent,reported,answers:rows,profile:answers,code,conclusion,action,reasons, research,lines:[g.detail,conclusion+'. '+action,'Reason: '+reasonText,contradiction?'Some answers conflict. This does not cancel an already identified reason to seek advice.':'The questionnaire is an educational decision aid, not a validated diagnostic or emergency triage tool.'],source:g.source};
}
export function currentProfile(mode) {
 return {...Object.fromEntries(questionnaire(mode).map(([id])=>[id,document.getElementById('survey-'+mode+'-'+id)?.value||''])),...sessionContext(),symptomMap:maps[mode]?.()||''};
}
export function currentGuidance(mode) {const r=getGuidance(mode,currentProfile(mode));r.evidence=featureEvidence(mode,r.profile,getObservation(mode));r.note=document.getElementById('note-'+mode)?.value?.slice(0,600)||'';return r;}
export function mountGuidance() {
 const profileKeys=PROFILE_FIELDS.map(([key])=>key);
 for(const [mode,g] of Object.entries(GUIDANCE)){
 const el=document.getElementById('guidance-'+mode);
 const qs=questionnaire(mode).filter(([id])=>!profileKeys.includes(id));
 el.innerHTML=`<p class="eyebrow">3 · UNDERSTAND & PLAN</p><h3>${g.title}</h3><p class="hint">You can answer without using the camera. These answers guide care suggestions; a movement or color score does not diagnose this condition.</p><div id="symptom-map-${mode}" class="symptom-map"></div><div class="survey-grid">${qs.map(([id,q,options])=>`<label>${q}<select id="survey-${mode}-${id}"><option value="">Not answered</option>${options.map(o=>`<option>${o}</option>`).join('')}</select></label>`).join('')}</div><p id="survey-progress-${mode}" class="hint small"></p><section class="conclusion-card" id="care-card-${mode}" aria-live="polite"><p>Consultation suggestion from your answers</p><h4 id="conclusion-${mode}"></h4><p id="advice-${mode}"></p></section><section id="feature-evidence-${mode}" class="feature-evidence"></section><label class="session-note">Notes for your appointment (optional, included in PDF)<textarea id="note-${mode}" maxlength="600" rows="3" placeholder="For example: when it happens, which finger, or an activity that is difficult."></textarea></label><details class="advanced"><summary>What this test can explain</summary><p>${g.detail}</p><p>${g.action}</p></details><details class="advanced"><summary>Research references and measurement limits</summary><p id="research-${mode}"></p></details><button id="care-pdf-${mode}" class="btn btn-secondary">Download symptom summary PDF</button><p id="care-export-${mode}" class="hint small" role="status"></p><p class="hint small">Answers and notes stay on this page until you leave or reload. They are included when you export a PDF. No disease probability is calculated.</p><a href="${g.source}" target="_blank" rel="noopener">Condition information: NHS</a> · <a href="https://www.nhs.uk/symptoms/hand-pain/finger-pain/" target="_blank" rel="noopener">When to seek care</a>`;
 const update=()=>{const r=currentGuidance(mode);document.getElementById('conclusion-'+mode).textContent=r.urgent?'Consultation recommended · urgent advice':r.conclusion;document.getElementById('care-card-'+mode).dataset.urgent=String(r.urgent);document.getElementById('advice-'+mode).textContent=r.action+' '+r.lines[2];document.getElementById('survey-progress-'+mode).textContent=`${qs.filter(([id])=>document.getElementById('survey-'+mode+'-'+id).value).length} of ${qs.length} questions answered. Blank and unsure answers remain unknown.`;const box=document.getElementById('feature-evidence-'+mode);box.replaceChildren();const heading=document.createElement('h4');heading.textContent='How the features fit together';box.append(heading);const interpretation=document.createElement('p');interpretation.textContent=r.evidence.interpretation;box.append(interpretation);for(const row of r.evidence.rows){const p=document.createElement('p');const b=document.createElement('strong');b.textContent=row.feature+' · '+row.status;p.append(b,document.createElement('br'),document.createTextNode(row.detail));box.append(p);}const source=document.createElement('a');source.href=r.evidence.source;source.textContent='Clinical feature reference';source.target='_blank';source.rel='noopener';box.append(source);const version=document.createElement('p');version.className='hint small';version.textContent=r.evidence.version+' · Feature selection is source-based; this referral rule has not been clinically validated.';box.append(version);const research=document.getElementById('research-'+mode);research.textContent=r.research.status+'. '+r.research.lines.join(' ');if(r.research.source){const a=document.createElement('a');a.href=r.research.source;a.textContent=' Read the study';a.target='_blank';a.rel='noopener';research.append(a);}};
 document.getElementById('care-pdf-'+mode).onclick=async()=>{const button=document.getElementById('care-pdf-'+mode),status=document.getElementById('care-export-'+mode);button.disabled=true;status.textContent='Creating your summary…';try{const {makeMovementReport}=await import('./movement-report.js');makeMovementReport({test:mode,name:mode+'_symptoms_'+Date.now(),date:new Date().toLocaleString(),status:'Questionnaire only; no camera measurement included',guidance:{...currentGuidance(mode),evidence:featureEvidence(mode,currentProfile(mode))},measurementContext:sessionContext(),metrics:[],explanation:'This summary contains your current answers and care guidance. Download the separate measurement report from the Result section to include camera data.'});status.textContent='Summary created.';}catch(e){status.textContent='Could not create PDF. Please try again.';}finally{button.disabled=false;}};
 qs.forEach(([id])=>document.getElementById('survey-'+mode+'-'+id).onchange=update);
 maps[mode]=mountSymptomMap(document.getElementById('symptom-map-'+mode),update);document.addEventListener('observation-change',update);document.addEventListener('session-context-change',update);update();
 }
}
