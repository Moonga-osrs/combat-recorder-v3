/** Replay camera controls applied before the renderer computes its view matrix. */
export function installReplayCamera(viewer:any,isFollowing:()=>boolean,follow:()=>void,moveOrbitHeight:(delta:number)=>void=()=>{}){
 let distance=9;const renderer=viewer.renderer,originalInput=renderer.handleInput.bind(renderer);
 renderer.handleInput=(deltaTime:number)=>{
  if(!isFollowing()){originalInput(deltaTime);return;}
  const camera=viewer.camera,input=viewer.inputManager,delta=320*deltaTime/1000;
  if(input.isKeyDown('ArrowLeft'))camera.updateYaw(camera.yaw,-delta);
  if(input.isKeyDown('ArrowRight'))camera.updateYaw(camera.yaw,delta);
  if(input.isKeyDown('ArrowUp'))camera.updatePitch(camera.pitch,delta);
  if(input.isKeyDown('ArrowDown'))camera.updatePitch(camera.pitch,-delta);
  const vertical=Number(input.isKeyDown('KeyQ'))-Number(input.isKeyDown('KeyE'));
  if(vertical){const speed=viewer.cameraSpeed*(input.isKeyDown('ShiftLeft')||input.isKeyDown('ShiftRight')?10:input.isKeyDown('Tab')?0.1:1);moveOrbitHeight(vertical*8*speed*deltaTime/1000);}
  renderer.handleMouseInput();
  camera.updatePitch(Math.max(-480,Math.min(-30,camera.pitch)),0);
  follow();
 };
 renderer.canvas.addEventListener('wheel',(event:WheelEvent)=>{
  event.preventDefault();const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?renderer.canvas.clientHeight:1);
  if(!Number.isFinite(pixels)||pixels===0)return;
  if(isFollowing()){distance=Math.max(2,Math.min(60,distance*Math.exp(Math.max(-500,Math.min(500,pixels))*0.0015)));follow();}
  else viewer.camera.move(0,0,Math.max(-8,Math.min(8,pixels*0.01)),true);
 },{passive:false});
 return {get distance(){return distance;}};
}
