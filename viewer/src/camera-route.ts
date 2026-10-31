import {buildRouteTiming,routeMediaTime,routeElapsedAt} from './route-timing';
export function formatReplayTime(ms:number){const seconds=Math.round(ms)/1000;return `${Math.floor(seconds/60)}:${(seconds%60).toFixed(3).padStart(6,'0')}`;}
export function parseReplayTime(value:string){
 const parts=value.trim().split(':');if(!parts.length||parts.length>3||parts.some(p=>!/^\d+(?:\.\d+)?$/.test(p)))return NaN;
 if(parts.length>1&&parts.slice(1).some(p=>Number(p)>=60))return NaN;
 return parts.reduce((n,p)=>n*60+Number(p),0)*1000;
}
export function routePose(points:any[],progress:number){
 if(points.length<2)return null;const t=Math.max(0,Math.min(1,progress))*(points.length-1),index=Math.min(points.length-2,Math.floor(t)),f=t-index,a=points[index],b=points[index+1];
 const lerp=(x:number,y:number)=>x+(y-x)*f,angle=((b.yaw-a.yaw+1024)%2048+2048)%2048-1024;
 return {position:a.position.map((v:number,i:number)=>lerp(v,b.position[i])),pitch:lerp(a.pitch,b.pitch),yaw:(a.yaw+angle*f+2048)%2048,fov:lerp(a.fov,b.fov),orthoZoom:lerp(a.orthoZoom,b.orthoZoom)};
}
export class CameraRoute {
 points:any[]=[];usePointTimes=false;pointTimes:number[]=[];cinematicPointTimes:number[]=[];start='0:00';end='0:10';pauseAt='0:00';pauseSeconds=0;slowAt='0:00';slowSeconds=0;slowdown=50;keepCameraMoving=true;timing:ReturnType<typeof buildRouteTiming>|null=null;elapsed=0;active=false;preparing=false;generation=0;
 constructor(private viewer:any,private notify:()=>void,private currentTime:()=>number=()=>0){}
 add(){if(this.active||this.preparing)return;const c=this.viewer.camera;this.points.push({position:[...c.pos],pitch:c.pitch,yaw:c.yaw,fov:c.fov,orthoZoom:c.orthoZoom,time:formatReplayTime(this.currentTime())});this.notify();}
 remove(){if(this.active||this.preparing)return;this.points.pop();this.notify();}
 stop(){this.active=false;this.preparing=false;this.generation++;this.notify();}
 reset(){this.stop();this.points=[];this.pointTimes=[];this.usePointTimes=false;this.start='0:00';this.end='0:10';this.pauseAt='0:00';this.pauseSeconds=0;this.slowAt='0:00';this.slowSeconds=0;this.slowdown=50;this.timing=null;this.elapsed=0;this.notify();}
 range(duration:number){const start=parseReplayTime(this.start),end=parseReplayTime(this.end);if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>duration)throw Error('Choose a valid gameplay range (m:ss), within the recording.');if(this.points.length<2)throw Error('Add at least two camera points with F3.');this.timing=buildRouteTiming(start,end,parseReplayTime(this.pauseAt),this.pauseSeconds,parseReplayTime(this.slowAt),this.slowSeconds,this.slowdown);this.pointTimes=this.points.map(p=>parseReplayTime(p.time||''));if(this.usePointTimes&&this.pointTimes.some((t,i)=>!Number.isFinite(t)||t<start||t>end||(i>0&&t<=this.pointTimes[i-1])))throw Error('Point times must be inside the gameplay range and strictly increasing.');this.cinematicPointTimes=this.pointTimes.map(t=>routeElapsedAt(this.timing!,t));this.elapsed=0;return {start,end};}
 mediaTime(elapsed:number){this.elapsed=elapsed;return this.timing?routeMediaTime(this.timing,elapsed):parseReplayTime(this.start)+elapsed;}
 timedPose(ms:number){
  const times=this.keepCameraMoving&&this.timing?this.cinematicPointTimes:this.pointTimes,t=this.keepCameraMoving&&this.timing?this.elapsed:ms;
  if(t<=times[0])return routePose(this.points.slice(0,2),0);
  for(let i=1;i<times.length;i++)if(t<=times[i])return routePose(this.points.slice(i-1,i+1),(t-times[i-1])/(times[i]-times[i-1]));
  return routePose(this.points.slice(-2),1);
 }
 apply(ms:number){if(!this.active)return;const start=parseReplayTime(this.start),end=parseReplayTime(this.end),pose=this.usePointTimes?this.timedPose(ms):routePose(this.points,this.keepCameraMoving&&this.timing?this.elapsed/this.timing.duration:(ms-start)/(end-start));if(pose)this.viewer.setCamera(pose);}
}
