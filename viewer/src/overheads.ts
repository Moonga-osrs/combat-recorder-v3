import assets from '../public/assets/replay-assets.json';
import {vec4} from 'gl-matrix';
import {healthBarGeometry} from './healthbar';
const hitsplatResources=assets.hitsplatResources,hitSpriteImages:any={},hitGlyphImages:any={},tintedHitGlyphs=new Map();
let position=0;
const hitSlots=[[0,0],[0,-20],[-15,-10],[15,-10]];
for(const [id,sprite] of Object.entries(hitsplatResources.sprites) as any){const img=new Image();img.src=sprite.png;hitSpriteImages[id]=img;}
for(const [fontId,font] of Object.entries(hitsplatResources.fonts) as any)for(const [ch,glyph] of Object.entries(font.glyphs) as any){const img=new Image();img.src=glyph.png;hitGlyphImages[fontId+':'+ch]=img;}
const prayerImages:any={};for(const [name,src] of Object.entries(assets.prayerSources)){const img=new Image();img.src=src as string;prayerImages[name]=img;}
function hitDefinition(h){let id=h.style??h.type,seen=new Set();while(id>=0&&!seen.has(id)){seen.add(id);const d=hitsplatResources.styles[id];if(!d)return null;if(!d.multihitsplats)return d;id=d.multihitsplats[d.multihitsplats.length-1];}return null;}
function hitFont(d){const id=d.fontType>=0?d.fontType:hitsplatResources.defaultFont;return hitsplatResources.fonts[id]?id:hitsplatResources.defaultFont;}
function hitTextWidth(text,fontId){const font=hitsplatResources.fonts[fontId];return Array.from(text).reduce((w,ch)=>w+(font?.advances[ch.charCodeAt(0)]||6),0);}
function tintedGlyph(fontId,ch,color){const key=fontId+':'+ch+':'+color;if(tintedHitGlyphs.has(key))return tintedHitGlyphs.get(key);const source=hitGlyphImages[fontId+':'+ch];if(!source?.complete||!source.naturalWidth)return null;const image=document.createElement('canvas');image.width=source.naturalWidth;image.height=source.naturalHeight;const c=image.getContext('2d');c.drawImage(source,0,0);c.globalCompositeOperation='source-in';c.fillStyle=color;c.fillRect(0,0,image.width,image.height);tintedHitGlyphs.set(key,image);return image;}
function drawHitText(c,text,x,baseline,color,fontId){const font=hitsplatResources.fonts[fontId];if(!font)return;let pen=Math.round(x);for(const char of text){const code=char.charCodeAt(0),glyph=font.glyphs[code],image=tintedGlyph(fontId,code,color),shadow=tintedGlyph(fontId,code,'#000000');if(glyph&&image){const y=Math.round(baseline-font.ascent+glyph.y);if(shadow)c.drawImage(shadow,pen+glyph.x+1,y+1);c.drawImage(image,pen+glyph.x,y);}pen+=font.advances[code]||6;}}
function drawGameHitsplat(c,h,x,y){
 const d=hitDefinition(h);if(h.style===-1)return;
 if(!d){c.save();c.fillStyle='white';c.font='11px monospace';c.textAlign='center';c.fillText(String(h.amount),x,y);c.restore();return;}
 const duration=Math.max(1,d.displayCycles*20),elapsed=Math.max(0,position-h.startMs),progress=Math.min(1,elapsed/duration),text=(d.stringFormat||'%1').replaceAll('%1',String(h.amount)),fontId=hitFont(d),textWidth=hitTextWidth(text,fontId);
 x+=d.scrollToOffsetX*progress;y-=d.scrollToOffsetY*progress;
 c.save();c.imageSmoothingEnabled=false;
 if(d.fadeStartCycle>=0&&elapsed>d.fadeStartCycle*20)c.globalAlpha=Math.max(0,(duration-elapsed)/Math.max(1,duration-d.fadeStartCycle*20));
 const parts=[d.leftSprite,d.leftSprite2,d.backgroundSprite,d.rightSpriteId].filter(id=>id>=0),middle=d.backgroundSprite;
 let textCenter=x;
 if(parts.length===1){const id=parts[0],s=hitsplatResources.sprites[id],image=hitSpriteImages[id];if(s&&image?.complete)c.drawImage(image,Math.round(x-s.maxW/2+s.x),Math.round(y-s.maxH/2+s.y));}
 else if(parts.length){const segment=id=>hitsplatResources.sprites[id]?.w||0,repeats=middle>=0?Math.max(1,Math.ceil((textWidth+2)/Math.max(1,segment(middle)))):0;
 const width=parts.reduce((sum,id)=>sum+segment(id)*(id===middle?repeats:1),0);let pen=x-width/2;
 for(const id of parts){const s=hitsplatResources.sprites[id],image=hitSpriteImages[id],count=id===middle?repeats:1;if(id===middle)textCenter=pen+segment(id)*count/2;for(let n=0;n<count;n++){if(s&&image?.complete)c.drawImage(image,Math.round(pen+s.x),Math.round(y-s.maxH/2+s.y));pen+=segment(id);}}}
 const color='#'+d.textColor.toString(16).padStart(6,'0');drawHitText(c,text,textCenter-textWidth/2,y+4+d.textOffsetY,color,fontId);c.restore();
}
export class OverheadLayer {
 private point=vec4.create();private head=[0,0];private hits=[0,0];
 canvas=document.createElement('canvas');context=this.canvas.getContext('2d')!;frame:any=null;time=0;viewer:any;pool:any;sprites=new Map<string,any>();
 constructor(viewer:any,pool:any){this.viewer=viewer;this.pool=pool;this.canvas.className='overhead-layer';viewer.renderer.canvas.parentElement.append(this.canvas);}
 sprite(input:any){const key=JSON.stringify(input);if(!this.sprites.has(key)){this.sprites.set(key,null);void this.pool.request('sprite',input).then((sprite:any)=>{if(!sprite)return;const canvas=document.createElement('canvas');canvas.width=sprite.width;canvas.height=sprite.height;canvas.getContext('2d')!.putImageData(new ImageData(sprite.pixels,sprite.width,sprite.height),0,0);this.sprites.set(key,{...sprite,canvas});}).catch(()=>{});}return this.sprites.get(key);}
 project(a:any,offset:number,result:number[]){const point=this.point;vec4.set(point,this.frame.baseX+a.x/128,(a.height-offset)/128,this.frame.baseY+a.z/128,1);vec4.transformMat4(point,point,this.viewer.camera.viewProjMatrix);if(point[3]<=0)return null;const x=point[0]/point[3],y=point[1]/point[3];if(Math.abs(x)>1.2||Math.abs(y)>1.2)return null;result[0]=(x+1)*this.canvas.clientWidth/2;result[1]=(1-y)*this.canvas.clientHeight/2;return result;}
 draw(){const c=this.context,w=this.canvas.clientWidth,h=this.canvas.clientHeight,scale=devicePixelRatio||1;if(this.canvas.width!==w*scale||this.canvas.height!==h*scale){this.canvas.width=w*scale;this.canvas.height=h*scale;}c.setTransform(scale,0,0,scale,0,0);c.clearRect(0,0,w,h);c.imageSmoothingEnabled=false;if(!this.frame)return;position=this.time;
  for(const a of this.frame.actors){if(a.kind||a.id===undefined)continue;const head=this.project(a,(a.logicalHeight||180)+12,this.head);if(!head)continue;let y=head[1];
   const bar=healthBarGeometry(a.healthRatio,a.healthScale);if(bar){const left=Math.round(head[0]-bar.width/2);c.fillStyle='#000';c.fillRect(left-1,y-1,bar.width+2,bar.height+2);c.fillStyle='#c00000';c.fillRect(left,y,bar.width,bar.height);c.fillStyle='#00b900';c.fillRect(left,y,bar.filled,bar.height);y-=28;}
   const icon=prayerImages[a.overheadIcon];if(icon?.complete&&icon.naturalWidth){c.drawImage(icon,Math.round(head[0]-icon.width/2),Math.round(y-icon.height));y-=icon.height+3;}
   const icons=[];if(a.skullIcon>=0)icons.push({name:'headicons_pk',sprite:a.skullIcon});
   for(let i=0;i<(a.overheadArchives?.length||0);i++)if(a.overheadArchives[i]>=0&&a.overheadSprites?.[i]>=0)icons.push({archive:a.overheadArchives[i],sprite:a.overheadSprites[i]});
   for(const input of icons){const sprite=this.sprite(input);if(sprite){c.drawImage(sprite.canvas,Math.round(head[0]-sprite.width/2),Math.round(y-sprite.height));y-=sprite.height+3;}}
   if(a.overheadText){c.font='16px "OSRS Bold"';c.textAlign='center';c.fillStyle='black';c.fillText(a.overheadText,head[0]+1,y+1);c.fillStyle='#ffff00';c.fillText(a.overheadText,head[0],y);}
   const hits=this.project(a,(a.logicalHeight||180)/2,this.hits);if(!hits)continue;
   let slot=0;for(const hit of a.hitsplats||[]){if(hit.startMs>position||hit.expiresMs<=position)continue;drawGameHitsplat(c,hit,hits[0]+hitSlots[slot][0],hits[1]+hitSlots[slot][1]);if(++slot===4)break;}
  }
 }
}
