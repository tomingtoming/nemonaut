// Diagnostic planning layer. Coordinates are metres in a local horizontal plane;
// heading is radians counterclockwise from +x. No flight state is modified.
const TAU=2*Math.PI;
const mod=a=>((a%TAU)+TAU)%TAU;
const left=v=>({x:-v.y,y:v.x});
const add=(a,b,k=1)=>({x:a.x+k*b.x,y:a.y+k*b.y});
const dot=(a,b)=>a.x*b.x+a.y*b.y;
const unit=a=>({x:Math.cos(a),y:Math.sin(a)});
function circle(p,sign,radius){return add(p,left(unit(p.heading)),sign*radius);}
function arc(center,start,end,sign,radius,loops=0){
 const angle=Math.atan2(start.y-center.y,start.x-center.x);
 const sweep=mod(sign*(Math.atan2(end.y-center.y,end.x-center.x)-angle))+loops*TAU;
 return {type:'arc',center,angle,sign,radius,sweep,length:sweep*radius};
}
export function routePoint(route,distance){
 if(!Number.isFinite(distance))throw new RangeError('Non-finite route distance');
 let d=Math.max(0,Math.min(route.length,distance));
 for(let i=0;i<route.segments.length;i++){
  const s=route.segments[i];
  if(d>s.length&&i<route.segments.length-1){d-=s.length;continue;}
  if(s.type==='line')return {...add(s.start,unit(s.heading),d),heading:s.heading,curvature:0};
  const angle=s.angle+s.sign*d/s.radius;
  return {...add(s.center,unit(angle),s.radius),heading:angle+s.sign*Math.PI/2,curvature:s.sign/s.radius};
 }
 throw new Error('Empty route');
}
// Four circle-straight-circle families. This is not a global shortest-path
// solver (three-arc paths are omitted), terrain avoidance, or a flyability proof.
export function planReturnRoute(start,goal,{radius,minLength=0}={}){
 if(![start?.x,start?.y,start?.heading,goal?.x,goal?.y,goal?.heading,radius,minLength].every(Number.isFinite)||radius<=0||minLength<0)
  throw new RangeError('Finite poses, positive radius and nonnegative minimum length required');
 const candidates=[];
 for(const first of [-1,1])for(const last of [-1,1]){
  const c1=circle(start,first,radius),c2=circle(goal,last,radius),delta=add(c2,c1,-1);
  const distance=Math.hypot(delta.x,delta.y),k=first===last?1:-1;
  if(distance<1e-8)continue;
  const projection=radius*(1-k)/distance;
  if(projection>1)continue;
  const along={x:delta.x/distance,y:delta.y/distance},normal=left(along);
  for(const side of [-1,1]){
   const n=add({x:projection*along.x,y:projection*along.y},normal,side*Math.sqrt(Math.max(0,1-projection**2)));
   const tangent=left(n),direction={x:first*tangent.x,y:first*tangent.y};
   const p1=add(c1,n,radius),p2=add(c2,n,k*radius),line=add(p2,p1,-1);
   if(dot(line,direction)<-1e-7)continue;
   const segments=[arc(c1,start,p1,first,radius),{type:'line',start:p1,heading:Math.atan2(direction.y,direction.x),length:Math.hypot(line.x,line.y)},arc(c2,p2,goal,last,radius)];
   let length=segments.reduce((sum,s)=>sum+s.length,0);
   const loops=Math.max(0,Math.ceil((minLength-length)/(TAU*radius)));
   segments[0].sweep+=loops*TAU;segments[0].length+=loops*TAU*radius;length+=loops*TAU*radius;
   candidates.push({segments,length,radius,loops,family:`${first>0?'L':'R'}S${last>0?'L':'R'}`});
  }
 }
 if(!candidates.length)throw new RangeError('Degenerate circle geometry');
 return candidates.sort((a,b)=>a.length-b.length)[0];
}
