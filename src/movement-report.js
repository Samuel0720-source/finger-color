import {contextText} from './session.js';
import { jsPDF } from 'jspdf';
export function makeMovementReport(info,{save=true}={}) {
 const doc=new jsPDF({unit:'mm',format:'a4'});let y=22;doc.setProperties({title:'Fingercolor '+info.test+' observation report',author:'Fingercolor',subject:'Personal measurements and self-reported symptom context'});
 const page=()=>{doc.addPage();y=22;};
 const text=(value,{bold=false,size=10,color=[35,48,60]}={})=>{
  doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(...color);
  const lines=doc.splitTextToSize(String(value),170);
  for(const line of lines){if(y+6>275)page();doc.text(line,20,y);y+=size*.44+1.5;}
  y+=2;
 };
 const noteText=value=>{
  if(!/[^\u0000-\u00ff]/.test(value)||typeof document==='undefined'){text(value);return;}
  // Render user notes with browser fonts so Korean and other scripts survive export.
  const canvas=document.createElement('canvas');canvas.width=1360;canvas.height=720;
  const ctx=canvas.getContext('2d');ctx.font='32px sans-serif';
  const lines=[];let line='';for(const ch of value){if(ch==='\n'||ctx.measureText(line+ch).width>1320){lines.push(line);line=ch==='\n'?'':ch;}else line+=ch;}if(line)lines.push(line);
  for(let i=0;i<lines.length;i+=12){const batch=lines.slice(i,i+12),height=batch.length*48+20;canvas.height=height;ctx.fillStyle='#fff';ctx.fillRect(0,0,1360,height);ctx.font='32px sans-serif';ctx.fillStyle='#23303c';batch.forEach((l,n)=>ctx.fillText(l,8,40+n*48));const mm=height/8;if(y+mm>275)page();doc.addImage(canvas.toDataURL('image/png'),'PNG',20,y,170,mm);y+=mm+4;}
 };
 const heading=s=>{if(y+18>275)page();y+=3;text(s,{bold:true,size:12});};
 doc.setFillColor(38,93,217);doc.rect(0,0,210,7,'F');
 text(info.test==='color'?'Color Observation Report':info.test==='tapping'?'Thumb Tapping Report':'Finger Movement Report',{bold:true,size:20});
 text('Personal observation tool. Not a diagnosis or validated disease screen.',{size:9});
 for(const [key,value] of [['Session',info.name],['Recorded',info.date],['Recording quality',info.status],['Report method','Color v2 / Movement v3; guidance v3']])text(key+': '+value);
 heading('Summary and next step');text(info.guidance.conclusion || 'Personal observation');text(info.guidance.action||'');text(info.guidance.lines[2]||'');text('Camera measurements describe color or movement; they do not diagnose a condition. Session answers below were entered by the user at export.');
 heading('Your measurements');
 if(!info.metrics.length)text('No camera measurements included.');
 for(const [key,value] of info.metrics)text(key+': '+value);
 heading('What the numbers mean');text(info.explanation);
 if(info.series?.length>1){
  if(y+76>275)page();heading(info.seriesLabel||'Recorded signal');
  const points=info.series.filter(p=>Number.isFinite(p.t)&&Number.isFinite(p.v));
  if(points.length>1){const first=points[0].t,last=points.at(-1).t;const min=Math.min(...points.map(p=>p.v)),max=Math.max(...points.map(p=>p.v));const w=160,h=40,x=25;
   doc.setDrawColor(200,207,217);doc.rect(x,y,w,h);doc.setDrawColor(38,93,217);doc.setLineWidth(.4);
   const stride=Math.max(1,Math.ceil(points.length/500));const selected=points.filter((_,i)=>i%stride===0||i===points.length-1);
   const pos=p=>[x+(p.t-first)/(last-first||1)*w,y+h-(p.v-min)/(max-min||1)*h];
   for(let i=1;i<selected.length;i++)doc.line(...pos(selected[i-1]),...pos(selected[i]));
   doc.setDrawColor(170,90,30);
   for(const t of info.tapTimes||[]){const tx=x+(t-first)/(last-first||1)*w;doc.line(tx,y+h-4,tx,y+h);}
   y+=47;if(info.test==='tapping')text('Orange ticks mark detected taps. Distance is estimated, not physical contact.',{size:8});text(`Time: ${first.toFixed(1)} to ${last.toFixed(1)} seconds. Signal range: ${min.toFixed(2)} to ${max.toFixed(2)}.`,{size:9});
  }
 }
 if(info.chartImg){if(y+78>275)page();doc.addImage(info.chartImg,'PNG',20,y,170,65);y+=73;}
 if(info.events?.length){heading('Why an event was flagged');for(const event of info.events)text(event,{size:9});}
 if(info.measurementContext){heading('Context at measurement start');text(contextText(info.measurementContext));}
 if(info.repeat){heading('Repeated measurements');for(const line of info.repeat.lines)text(line,{size:9});}
 const research=info.research||info.guidance.research;if(research){heading('Research reference');text(research.status,{bold:true});for(const line of research.lines)text(line,{size:9});if(research.source)text(research.source,{size:8});}
 page();heading('Interpretation and symptom context');heading(info.guidance.title);
 for(const line of info.guidance.lines)text(line,{size:10});
 if(info.guidance.note){heading('Your appointment notes');noteText(info.guidance.note);}
 if(info.guidance.evidence){heading('Feature evidence and interpretation');text(info.guidance.evidence.interpretation);for(const row of info.guidance.evidence.rows)text(row.feature+' ['+row.status+']: '+row.detail,{size:9});text('Feature source: '+info.guidance.evidence.source,{size:8});text('Rule version: '+info.guidance.evidence.version,{size:8});text('These source-based features do not validate the app consultation rule. No disease probability is calculated.',{size:9});}
 heading('Your questionnaire answers');
 for(const row of info.guidance.answers||[])text(row.question+': '+row.answer,{size:9});
 text('Urgent symptom information: https://www.nhs.uk/symptoms/hand-pain/finger-pain/',{size:8});
 text('Medical information source: '+info.guidance.source,{size:8});
 text('Camera measurements cannot determine a disease probability. Seek care for concerning symptoms even if this report shows no events.',{size:9});
 const count=doc.getNumberOfPages();for(let n=1;n<=count;n++){doc.setPage(n);doc.setFontSize(8);doc.setTextColor(100);doc.text(`Fingercolor | ${n} / ${count}`,20,289);}
 if(save)doc.save(info.name+'_report.pdf');return doc;
}
