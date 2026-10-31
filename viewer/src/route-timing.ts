export type TimingSegment={from:number,to:number,start:number,rate:number};
/** Maps cinematic elapsed time to recorded game time, independently of render FPS. */
export function buildRouteTiming(start:number,end:number,pauseAt:number,pauseSeconds:number,slowAt:number,slowSeconds:number,slowdown:number){
 if(![start,end,pauseSeconds,slowSeconds,slowdown].every(Number.isFinite)||end<=start||pauseSeconds<0||slowSeconds<0||slowdown<0||slowdown>99)throw Error('Invalid pause or slow-motion settings.');
 if(pauseSeconds&&(!Number.isFinite(pauseAt)||pauseAt<start||pauseAt>=end))throw Error('Pause time must be inside the selected gameplay range.');
 if(slowSeconds&&(!Number.isFinite(slowAt)||slowAt<start||slowAt>=end))throw Error('Slowdown time must be inside the selected gameplay range.');
 const rate=1-slowdown/100,slowEnd=slowAt+slowSeconds*1000*rate;
 const bounds=[...new Set([start,end,...(pauseSeconds?[pauseAt]:[]),...(slowSeconds?[slowAt,Math.min(end,slowEnd)]:[])])].sort((a,b)=>a-b);
 const segments:TimingSegment[]=[];let elapsed=0;
 for(let i=0;i<bounds.length-1;i++){const a=bounds[i],b=bounds[i+1];if(pauseSeconds&&a===pauseAt){segments.push({from:elapsed,to:elapsed+pauseSeconds*1000,start:a,rate:0});elapsed+=pauseSeconds*1000;}
 const speed=slowSeconds&&a>=slowAt&&a<slowEnd?rate:1,duration=(b-a)/speed;segments.push({from:elapsed,to:elapsed+duration,start:a,rate:speed});elapsed+=duration;}
 return {segments,duration:elapsed,start,end};
}
export function routeMediaTime(timing:ReturnType<typeof buildRouteTiming>,elapsed:number){
 const t=Math.max(0,elapsed);for(const s of timing.segments)if(t<s.to)return s.start+(t-s.from)*s.rate;return timing.end;
}

/** First arrival at a game timestamp; pauses at that timestamp begin after arrival. */
export function routeElapsedAt(timing:ReturnType<typeof buildRouteTiming>,ms:number){
 for(const s of timing.segments){if(ms<=s.start)return s.from;if(s.rate>0&&ms<=s.start+(s.to-s.from)*s.rate)return s.from+(ms-s.start)/s.rate;}return timing.duration;
}
