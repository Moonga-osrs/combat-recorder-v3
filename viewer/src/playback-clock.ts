/** Monotonic media time: a slow render frame must not slow the recording itself. */
export class PlaybackClock {
 private offset=0;private anchor=0;private running=false;
 position(now:number){return this.offset+(this.running?Math.max(0,now-this.anchor):0);}
 start(position:number,now:number){this.offset=position;this.anchor=now;this.running=true;}
 seek(position:number,now:number){this.offset=position;this.anchor=now;}
 pause(now:number){this.offset=this.position(now);this.running=false;return this.offset;}
}
