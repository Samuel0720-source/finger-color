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
 ['age','Age in years (optional)', Array.from({length:121},(_,i)=>String(i))],
 ['sex','Sex category for research context (optional)', ['Female','Male','Another category','Prefer not to say']],
 ['setup','Measurement setup label (keep the same for repeats)', ['Laptop camera / usual lighting','Phone camera / usual lighting','Other setup']],
 ['duration','How long have symptoms been present?', ['No symptoms','Less than 2 weeks','2 weeks or longer']],
 ['trend','How are symptoms changing?', ['No symptoms','Improving','Unchanged / persistent','Worsening']],
 ['impact','How do symptoms affect daily activities?', ['No impact','Some difficulty','Unable to do some usual activities']],
 ['hand','Which hand did you measure?', ['Left','Right']],
 ['dominant','Which is your dominant hand?', ['Left','Right','Both']],
 ['pain','Pain during this test (self-reported, not disease risk)', ['0 - none','1-3 - mild','4-6 - moderate','7-10 - severe']],
 ['fatigue','Were you tired during the test?', ['No','Yes','Unsure']]
];
export function questionnaire(mode) {
 return [...QUESTIONS[mode].map((q,i)=>['symptom'+i,q,['No','Yes','Unsure']]),...common];
}
export function getGuidance(mode,answers={}) {
 if(!answers || typeof answers !== 'object') answers={};
 const g=GUIDANCE[mode], qs=questionnaire(mode);
 const rows=qs.map(([id,q,options])=>({question:q,answer:options.includes(answers[id])?answers[id]:'Not answered'}));
 answers=Object.fromEntries(qs.map(([id,q,options])=>[id,options.includes(answers[id])?answers[id]:'']));
 const yes=QUESTIONS[mode].map((_,i)=>answers['symptom'+i]==='Yes');
 const reported=yes.some(Boolean);
 const reasons=[];
 if(answers.trend==='Worsening') reasons.push('Symptoms reported as worsening');
 if(answers.trend==='Unchanged / persistent') reasons.push('Symptoms reported as persistent');
 if(['Some difficulty','Unable to do some usual activities'].includes(answers.impact)) reasons.push('Daily activities affected');
 if(mode==='color'&&(yes[2]||yes[3])) reasons.push('One-sided changes or associated symptoms reported');
 if(answers.pain==='7-10 - severe') reasons.push('Severe pain reported');
 const core=['symptom0','symptom1','symptom2','symptom3','duration','trend','impact'];
 const missing=core.filter(id=>!answers[id]||answers[id]==='Unsure');
 const contradiction=(reported&&(answers.duration==='No symptoms'||answers.trend==='No symptoms'))||(!reported&&['symptom0','symptom1','symptom2','symptom3'].every(id=>answers[id]==='No')&&['Unchanged / persistent','Worsening'].includes(answers.trend));
 const code=reasons.length?'recommend':missing.length||contradiction?'insufficient':'no_indication';
 const conclusion={recommend:'Consultation recommended',no_indication:'No consultation indication identified',insufficient:'Insufficient information'}[code];
 const action=code==='recommend'?'Arrange a clinical assessment and bring this record. Symptoms guide this recommendation even when camera data are unavailable.':code==='no_indication'?'Your completed answers did not trigger the configured consultation criteria. This is not a health clearance; seek advice if symptoms persist, worsen or concern you.':'Complete or clarify the symptom questions. Blank answers are not treated as absence of symptoms.';
 const reasonText=reasons.length?reasons.join('; '):contradiction?'Some symptom answers conflict; please review them.':missing.length?'Missing or uncertain symptom answers: '+missing.map(id=>qs.find(q=>q[0]===id)[1]).join(' / '):'No reported persistence, worsening, daily limitation, severe test pain or configured condition-specific concern.';
 const research=researchContext(mode,answers);
 return {title:g.title,reported,answers:rows,profile:answers,code,conclusion,action,reasons, research,lines:[g.detail,conclusion+'. '+action,'Reason: '+reasonText,contradiction?'Some answers conflict. This does not cancel an already identified reason to seek advice.':'The questionnaire is an educational decision aid, not a validated diagnostic or emergency triage tool.'],source:g.source};
}
export function currentProfile(mode) {
 return Object.fromEntries(questionnaire(mode).map(([id])=>[id,document.getElementById('survey-'+mode+'-'+id)?.value||'']));
}
export function currentGuidance(mode) {return getGuidance(mode,currentProfile(mode));}
export function mountGuidance() {
 for(const [mode,g] of Object.entries(GUIDANCE)){
 const el=document.getElementById('guidance-'+mode);
 el.innerHTML=`<h3>${g.title}</h3><p>Optional symptom and session questions. Blank means unanswered, not no symptoms. Symptom answers remain on this page and are included in your PDF. Tapping history stores age, sex, hand and setup locally with each new measurement.</p><div class="survey-grid">${questionnaire(mode).map(([id,q,options])=>`<label>${q}${id==='age'?`<input id="survey-${mode}-${id}" type="number" min="0" max="120" step="1" placeholder="Not answered">`:`<select id="survey-${mode}-${id}"><option value="">Not answered</option>${options.map(o=>`<option>${o}</option>`).join('')}</select>`}</label>`).join('')}</div><section class="conclusion-card" aria-live="polite"><h4 id="conclusion-${mode}"></h4><p id="advice-${mode}"></p></section><details><summary>Published research and comparison limits</summary><p id="research-${mode}"></p></details><p>No validated disease probability or medical risk score is available.</p><a href="${g.source}" target="_blank" rel="noopener">Source: NHS patient information</a>`;
 const update=()=>{const r=currentGuidance(mode);document.getElementById('conclusion-'+mode).textContent=r.conclusion;document.getElementById('advice-'+mode).textContent=r.action+' '+r.lines[2];const research=document.getElementById('research-'+mode);research.textContent=r.research.status+'. '+r.research.lines.join(' ');if(r.research.source){const a=document.createElement('a');a.href=r.research.source;a.textContent=' Read the study';a.target='_blank';a.rel='noopener';research.append(a);}};
 questionnaire(mode).forEach(([id])=>document.getElementById('survey-'+mode+'-'+id).onchange=update);update();
 }
}
