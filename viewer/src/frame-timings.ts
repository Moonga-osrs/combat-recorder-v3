/** Bounded completed-draw interval metrics; excludes pauses and hidden-tab gaps. */
export class FrameTimings {
 private values:number[]=[];private last:number|null=null;stalls=0;
 constructor(private capacity=600){}
 clear(){this.values=[];this.last=null;this.stalls=0;}
 sample(time:number,playing:boolean){if(!playing){this.last=null;return;}const previous=this.last;this.last=time;if(previous===null)return;const delta=time-previous;if(delta<=0||delta>1000)return;this.values.push(delta);if(this.values.length>this.capacity)this.values.shift();if(delta>50)this.stalls++;}
 percentile(fraction:number){if(!this.values.length)return 0;const sorted=[...this.values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.min(sorted.length-1,Math.ceil(fraction*sorted.length)-1))];}
}
