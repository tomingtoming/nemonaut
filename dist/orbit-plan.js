import {PLANET} from './planet.js';
const TAU=Math.PI*2;
const wrap=x=>(x%TAU+TAU)%TAU;
export function apsisPlan(o){const body=o.body||PLANET,e=o.eccentricity,valid=o.normal.lengthSq()>.5&&o.p>1,base={kind:valid?(o.energy<0?'ellipse':'escape'):'radial',period:o.period,apoapsis:null,periapsis:null,caution:o.periapsis<0?'地表と交差：地表通過後の予測は無効':o.periapsis<body.atmosphereTop?'大気と交差：抗力によって予測が変わります':'二体軌道の予測（今後の噴射は含みません）'};if(body.sphereOfInfluence&&body.radius+o.apoapsis>=body.sphereOfInfluence)base.caution='月の重力圏を出る軌道：圏外の軌道線は省略。遠近点・周期は月のみの参考値です';if(!valid)return base;
 if(e<1e-4&&o.energy<0)return {...base,kind:'circular'};
 const rp=body.radius+o.periapsis,ra=body.radius+o.apoapsis,a=-body.mu/(2*o.energy);let periTime=null,apoTime=null;
 if(o.energy<0&&e<1){const E=Math.atan2(o.radius*o.vertical/(e*Math.sqrt(body.mu*a)),(1-o.radius/a)/e),M=wrap(E-e*Math.sin(E)),n=Math.sqrt(body.mu/a**3),remaining=target=>{const t=wrap(target-M)/n;return Math.min(t,o.period-t)<.001?0:t;};periTime=remaining(0);apoTime=remaining(Math.PI);}
 else if(o.energy>0&&e>1.0000001){const H=Math.asinh(o.radius*o.vertical/(e*Math.sqrt(body.mu*-a))),M=e*Math.sinh(H)-H,t=-M/Math.sqrt(body.mu/(-a)**3);if(t>=-.001)periTime=Math.max(0,t);}
 const at=(radius,time)=>({altitude:radius-body.radius,time,deltaV:radius>=body.radius?Math.sqrt(body.mu/radius)-Math.sqrt(Math.max(0,2*(o.energy+body.mu/radius))):null});
 base.periapsis=at(rp,periTime);if(Number.isFinite(ra))base.apoapsis=at(ra,apoTime);return base;}
export function formatDuration(seconds){if(!Number.isFinite(seconds)||seconds<0)return '—';const s=Math.round(seconds),h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?`${h}時間 ${m}分 ${s%60}秒`:`${m}分 ${s%60}秒`;}
