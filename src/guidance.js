// Educational symptom guidance, never a classifier based on a camera score.
export const GUIDANCE = {
 color: {title:"Color changes and Raynaud's", symptom:'My fingers repeatedly change color with cold or stress, with pain, numbness or tingling.', detail:"Recurring cold- or stress-related color changes can occur with Raynaud's. A camera recovery time cannot diagnose it or identify its cause.", action:'Discuss recurring symptoms with a clinician, especially if worsening, affecting daily life, on one side only, or accompanied by joint pain, a rash or muscle weakness.', source:'https://www.nhs.uk/conditions/raynauds/'},
 catching: {title:'Catching and trigger finger', symptom:'I feel a finger locking, clicking, or hurting when I bend or straighten it.', detail:'Painful clicking or a finger sticking in a bent position can occur with trigger finger. A detected pause-and-release pattern may also be voluntary movement or tracking noise.', action:'Arrange a clinical assessment if locking or pain persists or interferes with daily activities. Do not force a painful or locked finger.', source:'https://www.nhs.uk/conditions/trigger-finger/'},
 tapping: {title:'Dexterity and carpal tunnel symptoms', symptom:'I have recurring tingling, numbness, hand pain, or thumb/grip weakness, often worse at night.', detail:'These symptoms can occur with carpal tunnel syndrome. Slow tapping alone cannot identify carpal tunnel or any other disease; fatigue, pain, technique and tracking can change the score.', action:'Arrange a clinical assessment if these symptoms persist or worsen. A fast or normal-looking tapping result does not rule out a nerve problem.', source:'https://www.nhs.uk/conditions/carpal-tunnel-syndrome/'}
};
export function getGuidance(mode,reported=false) {
 const g=GUIDANCE[mode];
 return {title:g.title,reported,lines:[g.detail,reported?'You reported related symptoms. '+g.action:'If these symptoms apply to you: '+g.action,'This is educational guidance, not a diagnosis or a validated screening test.'],source:g.source};
}
export function currentGuidance(mode) {return getGuidance(mode,Boolean(document.getElementById('symptom-'+mode)?.checked));}
export function mountGuidance() {
 for(const [mode,g] of Object.entries(GUIDANCE)){
  const el=document.getElementById('guidance-'+mode);
  el.innerHTML=`<h3>${g.title}</h3><p>${g.detail}</p><label class="symptom-choice"><input type="checkbox" id="symptom-${mode}"><span>${g.symptom}</span></label><p id="advice-${mode}" role="status"></p><a href="${g.source}" target="_blank" rel="noopener">Source: NHS patient information ↗</a>`;
  const update=()=>{document.getElementById('advice-'+mode).textContent=currentGuidance(mode).lines[1];};
  document.getElementById('symptom-'+mode).onchange=update;update();
 }
}
