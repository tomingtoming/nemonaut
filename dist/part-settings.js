import {PARTS} from './catalog.js';
export function partSettings(p){
 const d=PARTS[p.type];
 const rows=[[d.docking,'fuelCrossfeed','燃料通過'],[d.gimbal,'gimbalEnabled','ジンバル'],[d.controlAxis,'controlEnabled','操舵面'],...['Pitch','Yaw','Roll'].map((axis,i)=>[d.controlAxis,'control'+axis,['ピッチ','ヨー','ロール'][i]]),[d.reactionTorque,'reactionEnabled','リアクションホイール'],[d.steer,'steeringEnabled','車輪操舵'],[p.type==='wheel','driveEnabled','車輪駆動']].filter(([yes])=>yes).map(([,key,label])=>({key,label,type:'boolean',value:p[key]??(key.startsWith('control')&&key!=='controlEnabled'?(d.controlAxis==='auto'||d.controlAxis===key.slice(7).toLowerCase()):true)}));
 if(d.thrust)rows.push({key:'thrustLimit',label:'推力上限',type:'number',value:p.thrustLimit??1,max:100,step:1,unit:'%'});
 if(d.controlAxis)rows.push({key:'controlLimit',label:'舵角上限',type:'number',value:p.controlLimit??1,max:d.maxDeflection||(d.controlAxis==='auto'?18:25),step:.5,unit:'°'});
 return rows;
}
export function validPartSetting(p,key,value){const s=partSettings(p).find(s=>s.key===key);return !!s&&(s.type==='boolean'?typeof value==='boolean':Number.isFinite(value)&&value>=0&&value<=1);}
