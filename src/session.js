// Shared, in-page session context. No symptom or note persistence.
export const PROFILE_FIELDS = [
 ['hand','Hand being measured',['Left','Right']],
 ['dominant','Dominant hand',['Left','Right','Both']],
 ['setup','Camera and room label',['Laptop / usual room','Phone / usual room','Other setup']],
 ['age','Age (optional)',null],
 ['sex','Sex for research context (optional)',['Female','Male','Another category','Prefer not to say']]
];
export function sessionContext(){return Object.fromEntries(PROFILE_FIELDS.map(([key])=>[key,document.getElementById('profile-'+key)?.value||'']));}
export function mountSession(){
 const root=document.getElementById('session-profile');
 root.innerHTML=`<div class="section-heading"><div><p class="eyebrow">1 · PREPARE</p><h3>Your session</h3></div><span class="research-badge">Shared across all three tests</span></div><p class="hint">Choose the hand and setup before measuring. Use the same room, camera and hand for repeat sessions. Optional fields can stay blank.</p><fieldset id="profile-fields" class="survey-grid"><legend class="sr-only">Measurement context</legend>${PROFILE_FIELDS.map(([key,label,options])=>`<label>${label}${options?`<select id="profile-${key}"><option value="">Not selected</option>${options.map(o=>`<option>${o}</option>`).join('')}</select>`:`<input id="profile-${key}" type="number" min="0" max="120" step="1" placeholder="Optional">`}</label>`).join('')}</fieldset><p class="hint small">Context is saved locally with completed measurements. It does not adjust a disease risk score. Changing the hand or lighting requires a new color baseline.</p>`;
 root.addEventListener('change',()=>document.dispatchEvent(new Event('session-context-change')));
 root.addEventListener('input',()=>document.dispatchEvent(new Event('session-context-change')));
}
export function lockSession(locked){const field=document.getElementById('profile-fields');if(field)field.disabled=locked;}
export function contextText(context={}){return PROFILE_FIELDS.map(([key,label])=>`${label}: ${context[key]||'Not selected'}`).join('; ');}
export function measurementQuality({valid,lines=[]}){return {label:valid?'Usable recording':'Repeat needed',lines};}
