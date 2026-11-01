// Distances are in hand lengths; these defaults only support legacy/tests.
export const CLOSE = 0.15;
export const OPEN = 0.3;
export const MAX_RELIABLE_TAPS_PER_SEC = 6;
const dist = (p, q) => Math.hypot(p.x-q.x, p.y-q.y, p.z-q.z);
export function measureGap(world) {
  if (!world || world.length !== 21) return null;
  const size = dist(world[0], world[9]);
  const gap = dist(world[4], world[8]) / size;
  return size > 0 && Number.isFinite(gap) ? gap : null;
}
const median = a => { const s=[...a].sort((a,b)=>a-b); const i=Math.floor(s.length/2); return s.length%2?s[i]:(s[i-1]+s[i])/2; };
export function calibrateTap(closedSamples, openSamples) {
  if ([closedSamples,openSamples].some(a=>a.length<15 || a.some(v=>!Number.isFinite(v)))) return {ok:false,reason:'Not enough visible-hand samples. Try again in steady light.'};
  const closed=median(closedSamples), opened=median(openSamples), span=opened-closed;
  const spread = a => median(a.map(v=>Math.abs(v-median(a))));
  if (span < .12 || span < 6*Math.max(spread(closedSamples),spread(openSamples))) return {ok:false,reason:'The camera could not distinguish touching from open. Show both fingertips, open wider, and recalibrate.'};
  return {ok:true,closed,opened,close:closed+.3*span,open:closed+.65*span};
}
export function createTapCounter({close=CLOSE,open=OPEN}={}) {
  if (!(close>=0 && open>close)) throw new RangeError('Invalid tap thresholds');
  let touching=false, armed=false, previous=null, lastTap=-Infinity;
  const tapTimes=[],trace=[];
  return {
    update(world,tMs) {
      const gap=measureGap(world);
      if(gap===null||!Number.isFinite(tMs)||tMs<0||(previous!==null&&tMs<=previous))return null;
      if(previous!==null&&tMs-previous>250){armed=false;touching=false;}
      previous=tMs;
      if(gap>open){armed=true;touching=false;}
      if(armed&&!touching&&gap<close&&tMs-lastTap>=80){touching=true;armed=false;lastTap=tMs;tapTimes.push(tMs);}
      trace.push({t:tMs,gap});
      return {gap,touching,taps:tapTimes.length};
    },
    result(durationMs) {
      if(!(durationMs>0))throw new RangeError('Duration must be positive');
      const gaps=tapTimes.slice(1).map((t,i)=>t-tapTimes[i]);
      const averageIntervalMs=gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:null;
      const sd=gaps.length>=2?Math.sqrt(gaps.reduce((s,g)=>s+(g-averageIntervalMs)**2,0)/(gaps.length-1)):null;
      return {taps:tapTimes.length,tapsPerSec:tapTimes.length/(durationMs/1000),averageIntervalMs,rhythmCV:sd===null?null:sd/averageIntervalMs*100,tapTimes:[...tapTimes],trace:[...trace],thresholds:{close,open}};
    }
  };
}
