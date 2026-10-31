import {mat4,vec4} from 'gl-matrix';
import {pickGround,groundHeight} from './tile-picking';
export class TilePings {
 active:any=null;private request=0;private inverse=mat4.create();private vector=vec4.create();
 constructor(private viewer:any,private overlay:any,private state:()=>any,private selectTile?:(tile:any)=>void){
  viewer.renderer.canvas.title='Drag to rotate | Scroll to zoom | Right-click to ping a tile';
  viewer.renderer.canvas.addEventListener('contextmenu',(event:MouseEvent)=>{event.preventDefault();event.stopImmediatePropagation();void this.ping(event.clientX,event.clientY).catch(error=>console.warn('Tile ping unavailable:',error.message));},true);
 }
 clear(){this.request++;this.active=null;}
 async ping(clientX:number,clientY:number){
  const state=this.state();if(!state?.source||!state.frame)return;const id=++this.request,frame=state.frame,ref=state.source.sceneRefAt(frame,state.position);if(!ref)return;
  // Snapshot the camera before asynchronous terrain access.
  const rect=this.viewer.renderer.canvas.getBoundingClientRect(),x=(clientX-rect.left)/rect.width*2-1,y=1-(clientY-rect.top)/rect.height*2;
  if(Math.abs(x)>1||Math.abs(y)>1||!mat4.invert(this.inverse,this.viewer.camera.viewProjMatrix))return;
  const unproject=(z:number)=>{vec4.set(this.vector,x,y,z,1);vec4.transformMat4(this.vector,this.vector,this.inverse);const w=this.vector[3];return [(this.vector[0]/w-frame.baseX)*128,this.vector[1]/w*128,(this.vector[2]/w-frame.baseY)*128];};
  const near=unproject(-1),far=unproject(1),direction=far.map((v,i)=>v-near[i]),scene=await state.source.scene(ref,true);
  const current=this.state();if(id!==this.request||current?.source!==state.source||current?.context!==state.context)return;
  const ground=[...scene.ground||[],...state.extraGround||[]],hit=pickGround(near,direction,ground);if(!hit)return;
  const tileX=Math.floor(hit.x/128),tileY=Math.floor(hit.z/128),corners=[[0,0],[1,0],[1,1],[0,1]].map(([dx,dz])=>{const lx=(tileX+dx)*128,lz=(tileY+dz)*128;return [frame.baseX+lx/128,(groundHeight(lx,lz,ground,hit.y)-2)/128,frame.baseY+lz/128];});
  this.selectTile?.({x:frame.baseX+tileX+0.5,z:frame.baseY+tileY+0.5,height:groundHeight((tileX+0.5)*128,(tileY+0.5)*128,ground,hit.y)/128,context:state.context});
  this.active={x:frame.baseX+tileX,y:frame.baseY+tileY,plane:frame.plane,context:state.context,corners,born:performance.now()};
 }
 draw(){const ping=this.active;if(!ping)return;const age=performance.now()-ping.born;if(age>2200||this.state()?.context!==ping.context){this.active=null;return;}const c=this.overlay.context,w=this.overlay.canvas.clientWidth,h=this.overlay.canvas.clientHeight;
  c.save();c.globalAlpha=Math.min(1,(2200-age)/500);c.strokeStyle='#ffe147';c.fillStyle='rgba(255,225,71,0.22)';c.lineWidth=2+Math.sin(age/100)*0.5;c.beginPath();
  let index=0;for(const point of ping.corners){vec4.set(this.vector,point[0],point[1],point[2],1);vec4.transformMat4(this.vector,this.vector,this.viewer.camera.viewProjMatrix);if(this.vector[3]<=0){c.restore();return;}const x=(this.vector[0]/this.vector[3]+1)*w/2,y=(1-this.vector[1]/this.vector[3])*h/2;if(index++)c.lineTo(x,y);else c.moveTo(x,y);}
  c.closePath();c.fill();c.stroke();c.restore();
 }
}
