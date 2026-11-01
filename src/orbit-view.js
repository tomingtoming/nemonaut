import {PLANET} from './planet.js';
export function drawOrbit(canvas,o,{detail=false,preview=null}={}){
 const body=o.body||PLANET,c=canvas.getContext('2d'),w=canvas.width,m=w/2;
 const extent=state=>Math.max(state.radius,Number.isFinite(state.apoapsis)?body.radius+state.apoapsis:body.radius*4);
 const limit=Math.min(body.sphereOfInfluence??Infinity,Math.max(body.radius*1.2,extent(o),preview?extent(preview.orbit):0)),scale=(m-(detail?52:12))/limit;
 c.clearRect(0,0,w,w);
 const circle=(r,color)=>{c.beginPath();c.arc(m,m,r*scale,0,2*Math.PI);c.fillStyle=color;c.fill();};
 circle(body.radius+body.atmosphereTop,'#3b748a');circle(body.radius,body.id==='moon'?'#777981':'#516e63');
 const eccentric=o.eccentricity>1e-4,x=eccentric?o.evec.clone().normalize():o.r.clone().normalize(),y=o.normal.clone().cross(x).normalize();
 const project=r=>[m+r.dot(x)*scale,m-r.dot(y)*scale];
 const path=(state,color,dashed=false)=>{
  if(state.normal.lengthSq()<.5)return;
  const ex=state.eccentricity>1e-4?state.evec.clone().normalize():state.r.clone().normalize(),ey=state.normal.clone().cross(ex).normalize();let prior=null,lastColor=null;c.beginPath();c.lineWidth=detail?2:1.5;c.setLineDash(dashed?[7,5]:[]);
  for(let i=0;i<=720;i++){
   const a=i*Math.PI/360,den=1+state.eccentricity*Math.cos(a),r=state.p/den;
   if(den<=0||r>limit*1.2||r>(body.sphereOfInfluence??Infinity)){c.stroke();c.beginPath();prior=null;continue;}
   const point=project(ex.clone().multiplyScalar(r*Math.cos(a)).addScaledVector(ey,r*Math.sin(a)));
   const segmentColor=r<body.radius?'#fa7370':color;if(segmentColor!==lastColor){c.stroke();c.beginPath();c.strokeStyle=segmentColor;c.setLineDash(dashed?[7,5]:r<body.radius?[3,4]:[]);if(prior)c.moveTo(...prior);lastColor=segmentColor;}if(prior)c.lineTo(...point);else c.moveTo(...point);prior=point;
  }c.stroke();c.setLineDash([]);
 };
 path(o,'#efb067');if(preview)path(preview.orbit,'#7de6ef',true);
 const marker=(r,color,label,size=4)=>{const [px,py]=project(r);c.beginPath();c.arc(px,py,size,0,Math.PI*2);c.fillStyle=color;c.fill();if(detail&&label)c.fillText(label,px,label==='予定噴射'?py+32:py-13);};
 c.font='13px sans-serif';c.textAlign='center';marker(o.r,'#fff','機体',detail?5:3);
 if(detail){c.fillStyle='#d2e4e8';c.fillText((body.name||'母星')+' / 半径'+body.radius/1000+' km / 大気'+body.atmosphereTop/1000+' km',m,m+5);
  if(eccentric&&o.normal.lengthSq()>.5){for(const [label,r,sign]of [['Pe',body.radius+o.periapsis,1],['Ap',body.radius+o.apoapsis,-1]]){if(!Number.isFinite(r)||r>limit*1.2||r>(body.sphereOfInfluence??Infinity))continue;const ax=m+sign*r*scale;c.fillStyle=r<body.radius?'#fa7370':'#efb067';c.beginPath();c.arc(ax,m,4,0,2*Math.PI);c.fill();c.fillText(label,ax,m+20);}}
  if(preview)marker(preview.orbit.r,'#7de6ef','予定噴射',5);
 }
}
