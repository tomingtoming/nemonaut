import {PARTS,type Part} from './catalog.js';
export type PartToggleKey='fuelEnabled'|'fuelCrossfeed'|'gimbalEnabled'|'controlEnabled'|'controlPitch'|'controlYaw'|'controlRoll'|'reactionEnabled'|'steeringEnabled'|'driveEnabled';
export type SettablePart=Part&Partial<Record<PartToggleKey,boolean>>&{thrustLimit?:number;fuelLoad?:number;controlLimit?:number};
export type PartSettingRow={key:string;label:string;type:'boolean';value:boolean}|{key:string;label:string;type:'number';value:number;max:number;step:number;unit:string};
export function partSettings(p:SettablePart):PartSettingRow[]{
 const d=PARTS[p.type];
 const rows:PartSettingRow[]=([[d.fuel||d.monoprop,'fuelEnabled','燃料使用'],[d.docking,'fuelCrossfeed','燃料通過'],[d.gimbal,'gimbalEnabled','ジンバル'],[d.controlAxis,'controlEnabled','操舵面'],...['Pitch','Yaw','Roll'].map((axis,i)=>[d.controlAxis,'control'+axis,['ピッチ','ヨー','ロール'][i]]),[d.reactionTorque,'reactionEnabled','リアクションホイール'],[d.steer,'steeringEnabled','車輪操舵'],[p.type==='wheel','driveEnabled','車輪駆動']] as [unknown,PartToggleKey,string][]).filter(([yes])=>yes).map<PartSettingRow>(([,key,label])=>({key,label,type:'boolean',value:p[key]??(key.startsWith('control')&&key!=='controlEnabled'?(d.controlAxis==='auto'||d.controlAxis===key.slice(7).toLowerCase()):true)}));
 if(d.cargoBay)rows.push({key:'cargoOpen',label:'貨物扉を開く',type:'boolean',value:p.cargoOpen===true});
 if(d.thrust)rows.push({key:'thrustLimit',label:'推力上限',type:'number',value:p.thrustLimit??1,max:100,step:1,unit:'%'});
 if(d.fuel||d.monoprop)rows.push({key:'fuelLoad',label:'燃料搭載量',type:'number',value:p.fuelLoad??1,max:100,step:1,unit:'%'});
 if(d.controlAxis)rows.push({key:'controlLimit',label:'舵角上限',type:'number',value:p.controlLimit??1,max:d.maxDeflection||(d.controlAxis==='auto'?18:25),step:.5,unit:'°'});
 return rows;
}
export function validPartSetting(p:SettablePart,key:string,value:unknown):boolean{const s=partSettings(p).find(s=>s.key===key);return !!s&&(s.type==='boolean'?typeof value==='boolean':Number.isFinite(value)&&(value as number)>=0&&(value as number)<=1);}
