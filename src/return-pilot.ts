import * as T from 'three';
export class ReturnPilot{
 declare completionMessage:string;declare phase:string;declare done:boolean;declare message:string;declare released:boolean;
 constructor(){this.completionMessage='着地完了。帰還実演を終了しました。宇宙センターの追跡施設で回収できます。';this.phase='逆行へ整列';this.done=false;this.message='帰還実演：逆行へ整列';this.released=false;}
 update(f){f.navigationAuto=false;f.navigationFrame='orbit';if(this.done||f.crashed){f.throttle=0;return;}f.sas=true;if(!this.released){f.sasMode='retrograde';const alignment=new T.Vector3(0,1,0).applyQuaternion(f.q).dot(f.vel.clone().normalize());f.throttle=0;if(alignment<-.985){while(f.stage<1)f.stageNext();f.throttle=.4;this.phase='逆噴射';if((f.orbit?.periapsis??Infinity)<25000){f.throttle=0;while(f.stage<2)f.stageNext();f.armParachutes();f.sasMode=f.vel.length()>300?'retrograde':'radial';this.released=true;this.phase='カプセル降下';}}}else{f.throttle=0;f.sasMode=f.vel.length()>300?'retrograde':'radial';this.phase=[...f.chutes.values()].some(c=>c.status==='open')?'パラシュート降下':'カプセル降下';if(f.landed){this.done=true;this.phase='着地完了';}}this.message='帰還実演：'+this.phase;}
}
