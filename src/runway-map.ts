import {RUNWAY,type RunwayApproach,type RunwayTrack} from './runway-navigation.js';

export interface MapPoint{x:number;y:number}
export interface RunwayMapLayout{plane:MapPoint;threshold:MapPoint;far:MapPoint;scale:number;arrow:MapPoint|null}
// Landing direction points up; threshold is (0,0), runway extends upward.
export function runwayMapLayout(v:RunwayApproach):RunwayMapLayout{
 const minX=Math.min(-1000,v.crossTrack),maxX=Math.max(1000,v.crossTrack);
 const minY=Math.min(-RUNWAY.length,v.remaining),maxY=Math.max(500,v.remaining);
 const scale=Math.min(192/(maxX-minX),112/(maxY-minY));
 const project=(x:number,y:number):MapPoint=>({x:120+(x-(minX+maxX)/2)*scale,y:80+(y-(minY+maxY)/2)*scale});
 const speed=v.track?Math.hypot(v.track.x,v.track.y):0;
 return {plane:project(v.crossTrack,v.remaining),threshold:project(0,0),far:project(0,-RUNWAY.length),scale,
  arrow:speed>0?{x:(v.track as RunwayTrack).x/speed*22,y:(v.track as RunwayTrack).y/speed*22}:null};
}

export function drawRunwayMap(canvas:HTMLCanvasElement,v:RunwayApproach|null,end:string):void{
 const c=canvas.getContext('2d');if(!c)throw Error('2D描画を初期化できません');c.clearRect(0,0,240,160);c.fillStyle='#17242a';c.fillRect(0,0,240,160);
 if(!v){canvas.setAttribute('aria-label','滑走路平面図・母星の圏外');return;}
 const m=runwayMapLayout(v),a=m.threshold,b=m.far,p=m.plane;
 c.strokeStyle='#667c86';c.setLineDash([4,4]);c.beginPath();c.moveTo(a.x,12);c.lineTo(a.x,148);c.stroke();c.setLineDash([]);
 c.strokeStyle='#d2d7ce';c.lineWidth=Math.max(5,RUNWAY.width*m.scale);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();c.lineWidth=1;
 c.fillStyle='#d2d7ce';c.font='11px sans-serif';c.fillText(end,a.x+8,a.y+4);
 c.fillStyle='#71dded';c.beginPath();c.arc(p.x,p.y,4,0,Math.PI*2);c.fill();
 if(m.arrow){const d=m.arrow,x=p.x+d.x,y=p.y+d.y,angle=Math.atan2(d.y,d.x);c.strokeStyle='#71dded';c.lineWidth=2;c.beginPath();c.moveTo(p.x,p.y);c.lineTo(x,y);c.moveTo(x-7*Math.cos(angle-.5),y-7*Math.sin(angle-.5));c.lineTo(x,y);c.lineTo(x-7*Math.cos(angle+.5),y-7*Math.sin(angle+.5));c.stroke();c.lineWidth=1;}
 const length=Math.max(100,Math.floor(60/m.scale/100)*100),pixels=length*m.scale;
 c.strokeStyle='#a6b6bb';c.beginPath();c.moveTo(12,151);c.lineTo(12+pixels,151);c.stroke();c.fillStyle='#a6b6bb';c.fillText(length>=1000?(length/1000).toFixed(1)+' km':length+' m',12,145);
 canvas.setAttribute('aria-label',`滑走路${end}が上向きの平面図。水色の点は機体、矢印は対地進路。中心線から${Math.round(v.crossTrack)}m、端まで${Math.round(v.remaining)}m。${m.arrow?'':'地表に対して停止中。'}`);
}
