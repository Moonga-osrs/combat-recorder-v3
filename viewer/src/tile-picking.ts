/** Intersect the recorded ground, not an assumed flat floor. Coordinates are local game units. */
export function pickGround(origin:number[],direction:number[],ground:any[]){
 let best=Infinity,result:any=null;
 for(const mesh of ground)for(let face=0;face<mesh.a.length;face++){
  const a=mesh.a[face],b=mesh.b[face],c=mesh.c[face],ax=mesh.x[a],ay=mesh.y[a],az=mesh.z[a],e1x=mesh.x[b]-ax,e1y=mesh.y[b]-ay,e1z=mesh.z[b]-az,e2x=mesh.x[c]-ax,e2y=mesh.y[c]-ay,e2z=mesh.z[c]-az;
  const px=direction[1]*e2z-direction[2]*e2y,py=direction[2]*e2x-direction[0]*e2z,pz=direction[0]*e2y-direction[1]*e2x,det=e1x*px+e1y*py+e1z*pz;if(Math.abs(det)<1e-8)continue;
  const tx=origin[0]-ax,ty=origin[1]-ay,tz=origin[2]-az,u=(tx*px+ty*py+tz*pz)/det;if(u<0||u>1)continue;
  const qx=ty*e1z-tz*e1y,qy=tz*e1x-tx*e1z,qz=tx*e1y-ty*e1x,v=(direction[0]*qx+direction[1]*qy+direction[2]*qz)/det;if(v<0||u+v>1)continue;
  const t=(e2x*qx+e2y*qy+e2z*qz)/det;if(t<0||t>=best)continue;best=t;result={x:origin[0]+direction[0]*t,y:origin[1]+direction[1]*t,z:origin[2]+direction[2]*t};
 }return result;
}
export function groundHeight(x:number,z:number,ground:any[],fallback:number){
 for(const mesh of ground)for(let face=0;face<mesh.a.length;face++){
  const a=mesh.a[face],b=mesh.b[face],c=mesh.c[face],ax=mesh.x[a],az=mesh.z[a],bx=mesh.x[b],bz=mesh.z[b],cx=mesh.x[c],cz=mesh.z[c],d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(d)<1e-8)continue;
  const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/d,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/d;if(u>=-1e-5&&v>=-1e-5&&u+v<=1+1e-5)return u*mesh.y[a]+v*mesh.y[b]+(1-u-v)*mesh.y[c];
 }return fallback;
}
