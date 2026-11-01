// Source: Kwon et al. 2022, Table 3. Values are spectral peak frequency,
// not counted taps / duration. Never use these as camera normal limits.
export const STUDY = {title:'Kwon et al. (2022), Table 3',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC9028619/',doi:'10.3233/THC-228011',participants:83,ageMin:20,ageMax:89};
export function researchContext(mode,profile={},measurement=null) {
 const lines=[];
 const age=Number(profile.age);
 if(mode!=='tapping')return {status:'Reference comparison unavailable',lines:['No compatible published reference range has been configured for this camera measurement. A normal range or percentile cannot be assigned.'],source:null};
 const validAge=profile.age!==''&&profile.age!=null&&Number.isInteger(age)&&age>=20&&age<=89;
 if(validAge){const group=age<30?['20-29',3.53]:age<50?['30-49',3.57]:age<=70?['50-70',2.69]:['71-89',2.36];lines.push(`Published age group ${group[0]} years: mean spectral peak frequency ${group[1].toFixed(2)} Hz.`);}else lines.push('Enter an age between 20 and 89 to view the published age-group mean. Outside that range, this study does not apply.');
 if(measurement?.valid)lines.push(`Your camera measurement: ${measurement.tapsPerSec.toFixed(2)} detected taps/s over 10 seconds.`);
 lines.push('Research context only: the study used a 250 Hz gyrosensor for 15 seconds and spectral analysis. This app counts camera-detected contacts for 10 seconds. The values are not interchangeable.');
 lines.push('No sex-specific or dominant-hand-specific age norms are supplied in this table. These inputs are recorded, not used to invent adjustments. No percentile, normal/abnormal label, or disease probability is calculated.');
 return {status:validAge?'Published mean available; direct comparison unavailable':'Age-group reference unavailable; direct comparison unavailable',lines,source:STUDY.url};
}
export function repeatSummary(records,context,mode='tapping'){
 const algorithm=mode==='color'?2:3;const unit=mode==='color'?'min':mode==='catching'?'finger-events':'taps/s';
 if(!context?.hand||!context?.setup)return {lines:['Select the measured hand and setup before starting to compare repeated trials.']};
 const mine=records.filter(s=>s.test===mode&&s.algorithm===algorithm&&s.context?.hand===context.hand&&s.context?.dominant===context.dominant&&s.context?.setup===context.setup&&Number.isFinite(s.result)).slice(-3);
 if(!mine.length)return {lines:['No matching trials yet. Repeat with the same hand and setup; stop if uncomfortable.']};
 const values=mine.map(s=>s.result),sorted=[...values].sort((a,b)=>a-b),n=sorted.length,median=n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2;
 return {lines:[`Last ${n} matching trials: ${values.map(v=>v.toFixed(2)).join(', ')} ${unit}. Median ${median.toFixed(2)}; range ${sorted[0].toFixed(2)}-${sorted.at(-1).toFixed(2)} ${unit}.`,`Dates: ${mine.map(s=>new Date(s.savedAt).toLocaleString()).join('; ')}. Matching is based on your hand/setup labels; device and lighting equivalence are not verified. Repeatability does not establish measurement accuracy.`]};
}
