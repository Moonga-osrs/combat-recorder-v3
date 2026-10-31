import {PRAYER_ORDER} from './prayer-order';
import assets from '../public/assets/replay-assets.json';
const names:any={0:'Head',1:'Cape',2:'Amulet',3:'Weapon',4:'Body',5:'Shield',7:'Legs',9:'Hands',10:'Feet',12:'Ring',13:'Ammo'};
const art:any={0:'HEAD',1:'CAPE',2:'AMULET',3:'WEAPON',4:'BODY',5:'SHIELD',7:'LEGS',9:'HANDS',10:'FEET',12:'RING',13:'AMMO'};
export class PlayerStateUI {
 root=document.createElement('section');tab='inventory';state:any=null;icons=new Map<string,string>();generation=0;
 constructor(parent:HTMLElement){this.root.className='game-panel';parent.append(this.root);}
 reset(){this.generation++;this.state=null;this.icons.clear();this.draw();}
 async update(state:any,recording:any){this.state=state;this.draw();const generation=++this.generation;
  for(const item of [...state?.inventory||[],...state?.equipment||[],...state?.groundItems||[]])if(item.icon&&!this.icons.has(item.icon)&&recording.icons.has(item.icon)){const row=await recording.row(recording.icons.get(item.icon));if(generation!==this.generation)return;this.icons.set(item.icon,'data:image/png;base64,'+row.data.png);}
  this.draw();
 }
 image(src:string,className=''){const image=document.createElement('img');image.src=src;image.alt='';image.className=className;return image;}
 draw(){this.root.replaceChildren();const nav=document.createElement('nav');nav.className='game-tabs';for(const [key,label] of [['inventory','Inventory'],['equipment','Equipment'],['prayers','Prayer'],['groundItems','Items']]){const button=document.createElement('button');button.textContent=label;button.className=this.tab===key?'selected':'';button.onclick=()=>{this.tab=key;this.draw();};nav.append(button);}this.root.append(nav);
  if(!this.state){this.root.append('No player state recorded.');return;}
  const panel=document.createElement('div');panel.className=this.tab;this.root.append(panel);
  if(this.tab==='prayers'){const active=new Set(this.state.prayers||[]);for(const name of PRAYER_ORDER){const src=assets.prayerUi[name];const entry=document.createElement('div');entry.className='prayer'+(active.has(name)?' active':'');entry.title=name.replaceAll('_',' ')+' · '+(active.has(name)?'Active':'Inactive');entry.append(this.image(src as string));panel.append(entry);}return;}
  if(this.tab==='groundItems'){const items=this.state.groundItems||[];if(items.length>20)panel.classList.add('scrollable');for(const item of items){const row=document.createElement('div');row.className='ground-item';this.item(row,item);panel.append(row);}if(!items.length)panel.textContent='No visible ground items';return;}
  if(this.tab==='equipment')panel.style.backgroundImage='url("'+assets.gameAssets.ui.BARS+'")';
  const slots=this.tab==='inventory'?Array.from({length:28},(_,i)=>i):[-1,0,-1,1,2,13,3,4,5,-1,7,-1,9,10,12];
  for(const index of slots){const cell=document.createElement('div');cell.className='slot';panel.append(cell);if(index<0)continue;cell.dataset.slot=String(index);const item=(this.state[this.tab]||[]).find((i:any)=>i.slot===index);
   if(this.tab==='equipment'){cell.style.backgroundImage='url("'+assets.gameAssets.ui.TILE+'")';if(!item){cell.title=names[index];cell.append(this.image((assets.gameAssets.ui as any)[art[index]],'placeholder'));}}
   if(item)this.item(cell,item);
  }
 }
 item(cell:HTMLElement,item:any){cell.title=(item.name||'Item '+item.id)+' ×'+item.quantity;const src=this.icons.get(item.icon)||(assets.gameAssets.items as any)[String(item.id)];if(src)cell.append(this.image(src,'item'));else cell.textContent=item.name||String(item.id);
  if(this.tab==='groundItems'){const label=document.createElement('span');label.textContent=cell.title;cell.append(label);return;}
  if(item.quantity>1||item.stackable){const count=document.createElement('span');count.className='quantity'+(item.quantity>=10000000?' green':item.quantity>=100000?' white':'');count.textContent=item.quantity>=10000000?Math.floor(item.quantity/1000000)+'M':item.quantity>=100000?Math.floor(item.quantity/1000)+'K':String(item.quantity);cell.append(count);}
 }
}
